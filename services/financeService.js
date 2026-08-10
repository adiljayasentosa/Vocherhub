const { db, admin } = require('../config/firebase-admin');
const {
  startOfDayWIB, startOfMonthWIB, dayKeyWIB, shortLabelWIB, formatFullWIB,
} = require('../utils/dateRange');
const { percentChange } = require('../utils/stats');

const MAX_LIST = 200; // sane cap on the (unpaginated, per the approved UI) income/expense lists

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Finance is a standalone manual ledger -- the approved "Tambah
 * Pemasukan"/"Tambah Pengeluaran" forms take free-text source/category
 * and a hand-entered amount. It does NOT automatically pull in Sales
 * revenue; a bookkeeper who wants voucher-sales income reflected here
 * enters it themselves (as the mock's own dummy "Penjualan Voucher"
 * income rows already imply -- free text, not a live link to `sales`).
 */
function validateEntryInput({ tanggal, label, jumlah }) {
  if (!tanggal) throw httpError(422, 'Tanggal wajib diisi.');
  const entryDate = new Date(tanggal);
  if (Number.isNaN(entryDate.getTime())) throw httpError(422, 'Tanggal tidak valid.');
  if (entryDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw httpError(422, 'Tanggal tidak boleh di masa depan.');
  }
  if (!label || !label.trim()) throw httpError(422, 'Sumber/Kategori wajib diisi.');
  if (label.trim().length > 200) throw httpError(422, 'Sumber/Kategori maksimal 200 karakter.');
  if (!Number.isFinite(jumlah) || jumlah < 1) throw httpError(422, 'Jumlah wajib diisi, minimal Rp 1.');
  return entryDate;
}

async function createEntry(type, {
  tanggal, label, deskripsi, jumlah,
}, actor) {
  const entryDate = validateEntryInput({ tanggal, label, jumlah });

  const ref = db.collection('finance').doc();
  await ref.set({
    type,
    label: label.trim(),
    description: (deskripsi || '').trim() || '-',
    amount: jumlah,
    entryDate,
    createdBy: { uid: actor.uid, name: actor.name || actor.email },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return ref.id;
}

const addIncome = (input, actor) => createEntry('income', input, actor);
const addExpense = (input, actor) => createEntry('expense', input, actor);

/** All entries of one type with entryDate in [start, end), summed. */
async function sumInRange(type, start, end) {
  let query = db.collection('finance').where('type', '==', type).where('entryDate', '>=', start);
  if (end) query = query.where('entryDate', '<', end);
  const snap = await query.get();
  return snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
}

async function sumAll(type) {
  const snap = await db.collection('finance').where('type', '==', type).get();
  return snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
}

async function getStats() {
  const [
    totalIncome, totalExpense, incomeThisMonth, expenseThisMonth, incomeLastMonth, expenseLastMonth,
  ] = await Promise.all([
    sumAll('income'),
    sumAll('expense'),
    sumInRange('income', startOfMonthWIB(0)),
    sumInRange('expense', startOfMonthWIB(0)),
    sumInRange('income', startOfMonthWIB(1), startOfMonthWIB(0)),
    sumInRange('expense', startOfMonthWIB(1), startOfMonthWIB(0)),
  ]);

  return {
    saldoSaatIni: totalIncome - totalExpense,
    totalPemasukan: totalIncome,
    totalPengeluaran: totalExpense,
    saldoBulanIni: incomeThisMonth - expenseThisMonth,
    trendPemasukan: percentChange(incomeThisMonth, incomeLastMonth),
    trendPengeluaran: percentChange(expenseThisMonth, expenseLastMonth),
  };
}

/** "Ringkasan Bulan Ini" on the Arus Kas tab: opening balance, this month's totals, closing balance. */
async function getMonthlySummary() {
  const [incomeBefore, expenseBefore, incomeThisMonth, expenseThisMonth] = await Promise.all([
    sumInRange('income', new Date(0), startOfMonthWIB(0)),
    sumInRange('expense', new Date(0), startOfMonthWIB(0)),
    sumInRange('income', startOfMonthWIB(0)),
    sumInRange('expense', startOfMonthWIB(0)),
  ]);
  const saldoAwal = incomeBefore - expenseBefore;
  return {
    totalPemasukan: incomeThisMonth,
    totalPengeluaran: expenseThisMonth,
    saldoAwal,
    saldoAkhir: saldoAwal + incomeThisMonth - expenseThisMonth,
  };
}

/**
 * Day-bucketed income vs expense for the last `days` WIB days, by
 * entryDate (not createdAt) so backdated entries land on the right day.
 */
async function getCashFlow(days = 30) {
  const start = startOfDayWIB(days - 1);
  const snap = await db.collection('finance').where('entryDate', '>=', start).get();

  const incomeByDay = {};
  const expenseByDay = {};
  snap.docs.forEach((doc) => {
    const e = doc.data();
    if (!e.entryDate) return;
    const key = dayKeyWIB(e.entryDate.toDate ? e.entryDate.toDate() : e.entryDate);
    const bucket = e.type === 'income' ? incomeByDay : expenseByDay;
    bucket[key] = (bucket[key] || 0) + (e.amount || 0);
  });

  const labels = [];
  const income = [];
  const expense = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = startOfDayWIB(i);
    const key = dayKeyWIB(date);
    labels.push(shortLabelWIB(date));
    income.push(incomeByDay[key] || 0);
    expense.push(expenseByDay[key] || 0);
  }
  return { labels, income, expense };
}

function docToRecord(doc) {
  const e = doc.data();
  const date = e.entryDate?.toDate ? e.entryDate.toDate() : new Date(e.entryDate);
  return {
    id: doc.id,
    tanggal: formatFullWIB(date).split(',')[0], // date only, matches the approved table's "3 Jun 2024" (no time)
    label: e.label,
    deskripsi: e.description,
    jumlah: e.amount,
  };
}

async function listEntries(type) {
  const snap = await db.collection('finance')
    .where('type', '==', type)
    .orderBy('entryDate', 'desc')
    .limit(MAX_LIST)
    .get();
  return snap.docs.map(docToRecord);
}

/** Merged recent activity feed for the Ringkasan tab, most-recently-entered first (createdAt, not entryDate). */
async function getRecentActivity(limit = 4) {
  const snap = await db.collection('finance').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => {
    const e = doc.data();
    const isIncome = e.type === 'income';
    return {
      icon: isIncome ? 'arrow-down-circle' : 'arrow-up-circle',
      color: isIncome ? 'text-green-600' : 'text-red-500',
      title: `${isIncome ? 'Pemasukan dari' : 'Pengeluaran'} ${e.label}`,
      date: docToRecord(doc).tanggal,
      amount: isIncome ? e.amount : -e.amount,
    };
  });
}

module.exports = {
  addIncome,
  addExpense,
  getStats,
  getMonthlySummary,
  getCashFlow,
  listEntries,
  getRecentActivity,
};
