const { db } = require('../config/firebase-admin');
const voucherService = require('./voucherService');
const salesService = require('./salesService');
const inventoryService = require('./inventoryService');
const { formatShortDateWIB, formatFullWIB } = require('../utils/dateRange');
const { renderTablePdf, renderTableExcel } = require('../utils/exportHelpers');

const REPORT_KEYS = ['penjualan', 'keuangan', 'voucher', 'presensi', 'stok'];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertValidKey(key) {
  if (!REPORT_KEYS.includes(key)) throw httpError(422, `Jenis laporan tidak valid. Pilihan: ${REPORT_KEYS.join(', ')}.`);
}

function parseRange(dateFrom, dateTo) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;
  if (from && Number.isNaN(from.getTime())) throw httpError(422, 'Tanggal mulai tidak valid.');
  if (to && Number.isNaN(to.getTime())) throw httpError(422, 'Tanggal akhir tidak valid.');
  return { from, to };
}

function periodLabel(from, to) {
  if (!from && !to) return 'Seluruh periode';
  if (from && to) return `${formatShortDateWIB(from)} - ${formatShortDateWIB(to)}`;
  if (from) return `Sejak ${formatShortDateWIB(from)}`;
  return `Sampai ${formatShortDateWIB(to)}`;
}

// ---- Laporan Penjualan ----
async function penjualanReport(from, to) {
  const { items } = await salesService.list({
    dateFrom: from, dateTo: to, pageSize: 500,
  });
  const total = items.reduce((s, r) => s + r.nominal, 0);
  return {
    summary: [
      { label: 'Total Transaksi', value: String(items.length) },
      { label: 'Total Pendapatan', value: `Rp ${total.toLocaleString('id-ID')}` },
    ],
    columns: [
      { key: 'waktu', label: 'Waktu', width: 110 },
      { key: 'kode', label: 'Kode Voucher', width: 110, excelWidth: 22 },
      { key: 'nominal', label: 'Nominal', width: 80 },
      { key: 'metode', label: 'Metode', width: 70 },
      { key: 'pembeli', label: 'Pembeli', width: 65 },
    ],
    rows: items.map((r) => ({ ...r, nominal: `Rp ${r.nominal.toLocaleString('id-ID')}` })),
  };
}

// ---- Laporan Keuangan ----
async function keuanganReport(from, to) {
  let query = db.collection('finance');
  if (from) query = query.where('entryDate', '>=', from);
  if (to) query = query.where('entryDate', '<', to);
  const snap = await query.orderBy('entryDate', 'desc').limit(500).get();

  const rows = snap.docs.map((doc) => {
    const e = doc.data();
    const date = e.entryDate?.toDate ? e.entryDate.toDate() : new Date(e.entryDate);
    return {
      tanggal: formatFullWIB(date).split(',')[0],
      tipe: e.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      label: e.label,
      jumlah: e.amount,
    };
  });
  const totalIncome = rows.filter((r) => r.tipe === 'Pemasukan').reduce((s, r) => s + r.jumlah, 0);
  const totalExpense = rows.filter((r) => r.tipe === 'Pengeluaran').reduce((s, r) => s + r.jumlah, 0);

  return {
    summary: [
      { label: 'Total Pemasukan', value: `Rp ${totalIncome.toLocaleString('id-ID')}` },
      { label: 'Total Pengeluaran', value: `Rp ${totalExpense.toLocaleString('id-ID')}` },
      { label: 'Saldo Periode', value: `Rp ${(totalIncome - totalExpense).toLocaleString('id-ID')}` },
    ],
    columns: [
      { key: 'tanggal', label: 'Tanggal', width: 90 },
      { key: 'tipe', label: 'Tipe', width: 80 },
      { key: 'label', label: 'Sumber/Kategori', width: 200, excelWidth: 25 },
      { key: 'jumlah', label: 'Jumlah', width: 100 },
    ],
    rows: rows.map((r) => ({ ...r, jumlah: `Rp ${r.jumlah.toLocaleString('id-ID')}` })),
  };
}

// ---- Laporan Voucher ----
// Date range doesn't apply to a point-in-time stock/status snapshot; reuses
// Inventory's per-nominal aggregation rather than re-deriving it.
async function voucherReport() {
  const rows = await voucherService.list({ pageSize: 500 });
  const stockRows = await inventoryService.getOverview();

  return {
    summary: stockRows.rows.map((r) => ({
      label: `Nominal Rp ${r.nominal.toLocaleString('id-ID')}`, value: `${r.stok} tersedia dari ${r.total}`,
    })),
    columns: [
      { key: 'code', label: 'Kode', width: 120, excelWidth: 22 },
      { key: 'nominal', label: 'Nominal', width: 80 },
      { key: 'status', label: 'Status', width: 80 },
      { key: 'tanggal', label: 'Tanggal Dibuat', width: 110, excelWidth: 20 },
    ],
    rows: rows.items.map((v) => ({ ...v, nominal: `Rp ${v.nominal.toLocaleString('id-ID')}` })),
  };
}

// ---- Laporan Presensi ----
async function presensiReport(from, to) {
  let query = db.collection('attendanceRecords');
  if (from) query = query.where('weekOf', '>=', from.toISOString().slice(0, 10));
  if (to) query = query.where('weekOf', '<', to.toISOString().slice(0, 10));
  const snap = await query.get();

  const byMember = new Map();
  snap.docs.forEach((doc) => {
    const r = doc.data();
    if (!byMember.has(r.memberId)) {
      byMember.set(r.memberId, {
        nama: r.memberName, kelas: r.kelas, Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0,
      });
    }
    const e = byMember.get(r.memberId);
    e[r.status] = (e[r.status] || 0) + 1;
  });
  const rows = [...byMember.values()].sort((a, b) => a.nama.localeCompare(b.nama));
  const totals = rows.reduce((acc, r) => ({
    Hadir: acc.Hadir + r.Hadir, Izin: acc.Izin + r.Izin, Sakit: acc.Sakit + r.Sakit, Alpa: acc.Alpa + r.Alpa,
  }), {
    Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0,
  });

  return {
    summary: [
      { label: 'Total Hadir', value: String(totals.Hadir) },
      { label: 'Total Izin', value: String(totals.Izin) },
      { label: 'Total Sakit', value: String(totals.Sakit) },
      { label: 'Total Alpa', value: String(totals.Alpa) },
    ],
    columns: [
      { key: 'nama', label: 'Nama', width: 150, excelWidth: 25 },
      { key: 'kelas', label: 'Kelas', width: 80 },
      { key: 'Hadir', label: 'Hadir', width: 60 },
      { key: 'Izin', label: 'Izin', width: 60 },
      { key: 'Sakit', label: 'Sakit', width: 60 },
      { key: 'Alpa', label: 'Alpa', width: 60 },
    ],
    rows,
  };
}

// ---- Laporan Stok ----
// Same underlying snapshot as Laporan Voucher's summary, presented as its
// own report per the approved UI's separate "Laporan Stok" card.
async function stokReport() {
  const { rows } = await inventoryService.getOverview();
  return {
    summary: [
      { label: 'Total Stok Tersedia', value: String(rows.reduce((s, r) => s + r.stok, 0)) },
      { label: 'Nominal Stok Rendah', value: String(rows.filter((r) => r.status === 'Rendah').length) },
    ],
    columns: [
      { key: 'nominal', label: 'Nominal', width: 90 },
      { key: 'total', label: 'Total', width: 60 },
      { key: 'stok', label: 'Stok', width: 60 },
      { key: 'status', label: 'Status', width: 80 },
    ],
    rows: rows.map((r) => ({ ...r, nominal: `Rp ${r.nominal.toLocaleString('id-ID')}` })),
  };
}

const BUILDERS = {
  penjualan: (from, to) => penjualanReport(from, to),
  keuangan: (from, to) => keuanganReport(from, to),
  voucher: () => voucherReport(),
  presensi: (from, to) => presensiReport(from, to),
  stok: () => stokReport(),
};

const TITLES = {
  penjualan: 'Laporan Penjualan',
  keuangan: 'Laporan Keuangan',
  voucher: 'Laporan Voucher',
  presensi: 'Laporan Presensi',
  stok: 'Laporan Stok',
};

async function getReport(key, dateFrom, dateTo) {
  assertValidKey(key);
  const { from, to } = parseRange(dateFrom, dateTo);
  const data = await BUILDERS[key](from, to);
  return {
    title: TITLES[key], periode: periodLabel(from, to), ...data,
  };
}

async function exportPdfBuffer(key, dateFrom, dateTo) {
  const report = await getReport(key, dateFrom, dateTo);
  return renderTablePdf({
    title: report.title, subtitle: report.periode, columns: report.columns, rows: report.rows,
  });
}

async function exportExcelBuffer(key, dateFrom, dateTo) {
  const report = await getReport(key, dateFrom, dateTo);
  return renderTableExcel({
    title: report.title, subtitle: report.periode, columns: report.columns, rows: report.rows, sheetName: report.title,
  });
}

module.exports = {
  REPORT_KEYS, TITLES, getReport, exportPdfBuffer, exportExcelBuffer,
};
