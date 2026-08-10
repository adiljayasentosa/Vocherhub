const { db, admin } = require('../config/firebase-admin');
const logService = require('./logService');
const stockMovementService = require('./stockMovementService');
const {
  startOfTodayWIB, startOfDayWIB, startOfMonthWIB, dayKeyWIB, shortLabelWIB, formatFullWIB,
} = require('../utils/dateRange');
const { percentChange } = require('../utils/stats');

// Fixed to match the approved Sales page's "Jual Voucher" modal exactly.
// Note this is a *different* (smaller) set than the Voucher module's
// NOMINALS — that's a discrepancy already present between the two
// approved Phase 2.1 mocks, not something introduced here.
const NOMINALS = [3000, 5000, 10000];
const METHODS = ['Tunai', 'QRIS'];
const BUYER_TYPES = ['Siswa', 'Guru', 'Staff'];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertOneOf(value, allowed, fieldLabel) {
  if (!allowed.includes(value)) {
    throw httpError(422, `${fieldLabel} tidak valid. Pilihan yang tersedia: ${allowed.join(', ')}.`);
  }
}

/** Raw sale docs with createdAt >= start (and < end, if given). Used for revenue summation. */
async function getSalesInRange(start, end) {
  let query = db.collection('sales').where('createdAt', '>=', start);
  if (end) query = query.where('createdAt', '<', end);
  const snap = await query.get();
  return snap.docs.map((d) => d.data());
}

function sumNominal(sales) {
  return sales.reduce((sum, s) => sum + (s.nominal || 0), 0);
}

/**
 * Day-bucketed revenue for the last `days` WIB days (oldest -> newest).
 * Shared by the Sales page's own trend chart and the Dashboard's Revenue
 * Chart widget — same 7-day-by-default shape both pages need.
 */
async function getRevenueChart(days = 7) {
  const start = startOfDayWIB(days - 1);
  const sales = await getSalesInRange(start);

  const totalsByDay = {};
  sales.forEach((sale) => {
    if (!sale.createdAt) return;
    const key = dayKeyWIB(sale.createdAt.toDate());
    totalsByDay[key] = (totalsByDay[key] || 0) + (sale.nominal || 0);
  });

  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = startOfDayWIB(i);
    const key = dayKeyWIB(date);
    labels.push(shortLabelWIB(date));
    values.push(totalsByDay[key] || 0);
  }
  return { labels, values };
}

/** Common denormalized view of a sale doc, shared by every endpoint that lists sales. */
function docToRecord(doc) {
  const s = doc.data();
  const date = s.createdAt ? s.createdAt.toDate() : new Date();
  return {
    id: doc.id,
    waktu: formatFullWIB(date),
    kode: s.voucherCode || '-',
    nominal: s.nominal || 0,
    metode: s.method || '-',
    pembeli: s.buyerType || '-',
    operator: s.operatorName || '-',
    status: s.status || 'Selesai',
  };
}

/** Most recent N sales, most-recent first. Used by the Dashboard's "Recent Transactions". */
async function getRecentTransactions(limit) {
  const snap = await db.collection('sales').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(docToRecord);
}

/**
 * Stats for the Sales page's 4 stat cards: today's revenue/count (+ trend
 * vs yesterday), this month's revenue, and all-time transaction count.
 */
async function getStats() {
  const [todaySales, yesterdaySales, monthSales, totalSnap] = await Promise.all([
    getSalesInRange(startOfTodayWIB()),
    getSalesInRange(startOfDayWIB(1), startOfDayWIB(0)),
    getSalesInRange(startOfMonthWIB()),
    db.collection('sales').count().get(),
  ]);

  const pendapatanHariIni = sumNominal(todaySales);
  const pendapatanKemarin = sumNominal(yesterdaySales);

  return {
    pendapatanHariIni,
    transaksiHariIni: todaySales.length,
    trendPendapatan: percentChange(pendapatanHariIni, pendapatanKemarin),
    trendTransaksi: percentChange(todaySales.length, yesterdaySales.length),
    pendapatanBulanIni: sumNominal(monthSales),
    totalTransaksi: totalSnap.data().count,
  };
}

/**
 * Paginated, searchable Sales History.
 * `search` can match either the voucher code (prefix) or the buyer type
 * (Siswa/Guru/Staff). Firestore has no native OR-across-fields query for
 * this SDK version, so when a search term is present both candidate
 * queries run and results are merged/sorted in memory before pagination
 * — an acceptable trade-off at school scale, not true server-side OR.
 * `dateFrom`/`dateTo` (WIB day boundaries) filter the History table only
 * — the stat cards above it always show today/this-month regardless.
 */
async function list({ search = '', dateFrom = null, dateTo = null, page = 1, pageSize = 5 } = {}) {
  const term = search.trim();

  async function baseFilteredDocs() {
    let query = db.collection('sales');
    if (dateFrom) query = query.where('createdAt', '>=', dateFrom);
    if (dateTo) query = query.where('createdAt', '<', dateTo);
    return query;
  }

  let docs;
  if (term) {
    const codeTerm = term.toUpperCase();
    const matchingBuyerTypes = BUYER_TYPES.filter((b) => b.toLowerCase().startsWith(term.toLowerCase()));

    let codeQuery = (await baseFilteredDocs())
      .where('voucherCode', '>=', codeTerm).where('voucherCode', '<=', codeTerm + '\uf8ff');
    const queries = [codeQuery.get()];
    for (const buyerType of matchingBuyerTypes) {
      queries.push((await baseFilteredDocs()).where('buyerType', '==', buyerType).get());
    }

    const snaps = await Promise.all(queries);
    const seen = new Map();
    snaps.forEach((snap) => snap.docs.forEach((d) => seen.set(d.id, d)));
    docs = [...seen.values()].sort((a, b) => {
      const at = a.data().createdAt?.toMillis?.() ?? 0;
      const bt = b.data().createdAt?.toMillis?.() ?? 0;
      return bt - at;
    });
  } else {
    const query = (await baseFilteredDocs()).orderBy('createdAt', 'desc');
    const snap = await query.get();
    docs = snap.docs;
  }

  const totalItems = docs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageDocs = docs.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    items: pageDocs.map(docToRecord),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  };
}

async function getById(id) {
  const doc = await db.collection('sales').doc(id).get();
  if (!doc.exists) throw httpError(404, 'Transaksi tidak ditemukan.');
  return docToRecord(doc);
}

/**
 * Sells one voucher of `nominal`: atomically claims an `available`
 * voucher of that nominal (marks it `sold`) and writes the sale record,
 * so two operators can never sell the same last unit. Throws 409 if
 * stock for that nominal is empty.
 */
async function sell({ nominal, pembeli, metode }, actor) {
  assertOneOf(nominal, NOMINALS, 'Nominal');
  assertOneOf(pembeli, BUYER_TYPES, 'Pembeli');
  assertOneOf(metode, METHODS, 'Metode pembayaran');

  const saleRef = db.collection('sales').doc();

  const result = await db.runTransaction(async (tx) => {
    const availableQuery = db.collection('vouchers')
      .where('nominal', '==', nominal)
      .where('status', '==', 'available')
      .limit(1);
    const availableSnap = await tx.get(availableQuery);

    if (availableSnap.empty) {
      throw httpError(409, `Stok voucher nominal Rp ${nominal.toLocaleString('id-ID')} habis.`);
    }

    const voucherDoc = availableSnap.docs[0];
    const voucherCode = voucherDoc.data().code;

    tx.update(voucherDoc.ref, {
      status: 'sold',
      soldAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(saleRef, {
      voucherCode,
      nominal,
      operatorId: actor.uid,
      operatorName: actor.name || actor.email,
      method: metode,
      buyerType: pembeli,
      status: 'Selesai',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { voucherCode };
  });

  await logService.log('sale_created', {
    uid: actor.uid,
    email: actor.email,
    message: `Voucher ${result.voucherCode} terjual (Rp ${nominal.toLocaleString('id-ID')}, ${metode}, pembeli ${pembeli})`,
  });

  await stockMovementService.record({
    nominal, action: 'Terjual', delta: -1, actorName: actor.name || actor.email,
  });

  return getById(saleRef.id);
}

module.exports = {
  NOMINALS,
  METHODS,
  BUYER_TYPES,
  getSalesInRange,
  getRevenueChart,
  getRecentTransactions,
  getStats,
  list,
  getById,
  sell,
};
