const { db } = require('../config/firebase-admin');
const env = require('../config/env');
const voucherService = require('./voucherService');
const { startOfTodayWIB, formatFullWIB } = require('../utils/dateRange');

/**
 * Per-nominal breakdown (total/aktif/terjual/nonaktif/stok/status), one
 * row per value in voucherService.NOMINALS — the single source of truth
 * for which nominals can ever exist, rather than a separately hardcoded
 * list (the approved mock's own list included 50000, a value the Voucher
 * module can never actually create).
 */
async function getStockByNominal() {
  const col = db.collection('vouchers');
  const threshold = env.inventory.lowStockThresholdPerNominal;

  const rows = await Promise.all(voucherService.NOMINALS.map(async (nominal) => {
    const base = col.where('nominal', '==', nominal);
    const [totalSnap, aktifSnap, terjualSnap, nonaktifSnap] = await Promise.all([
      base.count().get(),
      base.where('status', '==', 'available').count().get(),
      base.where('status', '==', 'sold').count().get(),
      base.where('status', '==', 'expired').count().get(),
    ]);
    const stok = aktifSnap.data().count;
    return {
      nominal,
      total: totalSnap.data().count,
      aktif: stok,
      terjual: terjualSnap.data().count,
      nonaktif: nonaktifSnap.data().count,
      stok,
      status: stok < threshold ? 'Rendah' : 'Aman',
    };
  }));

  return rows;
}

/** Net stock-movement delta per nominal, today (WIB) — powers the stat-card trend lines. */
async function getTodayDeltas() {
  const snap = await db.collection('stockMovements').where('createdAt', '>=', startOfTodayWIB()).get();
  const deltas = {};
  snap.docs.forEach((doc) => {
    const m = doc.data();
    deltas[m.nominal] = (deltas[m.nominal] || 0) + (m.delta || 0);
  });
  return deltas;
}

/**
 * Stock Overview: per-nominal rows + today's net movement per nominal,
 * for the page's stat cards and main table in one call.
 */
async function getOverview() {
  const [rows, deltas] = await Promise.all([getStockByNominal(), getTodayDeltas()]);
  return {
    rows: rows.map((r) => ({ ...r, deltaHariIni: deltas[r.nominal] || 0 })),
  };
}

/** Most recent N stock movements, most-recent first — "Riwayat Pergerakan Stok". */
async function getMovements(limit = 20) {
  const snap = await db.collection('stockMovements').orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => {
    const m = doc.data();
    const date = m.createdAt ? m.createdAt.toDate() : new Date();
    return {
      tanggal: formatFullWIB(date),
      aksi: m.action,
      nominal: m.nominal,
      jumlah: m.delta,
      oleh: m.actorName || '-',
    };
  });
}

module.exports = { getOverview, getMovements };
