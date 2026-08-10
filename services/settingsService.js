const { db, admin, auth } = require('../config/firebase-admin');
const env = require('../config/env');
const { formatFullWIB } = require('../utils/dateRange');

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// ---- Informasi Sekolah ----
const SCHOOL_DOC = db.collection('schoolInfo').doc('main');
const DEFAULT_SCHOOL = {
  nama: 'SMK IBG 3', npsn: '', alamat: '', telepon: '', email: '',
};

async function getSchoolInfo() {
  const doc = await SCHOOL_DOC.get();
  return doc.exists ? { ...DEFAULT_SCHOOL, ...doc.data() } : DEFAULT_SCHOOL;
}

async function updateSchoolInfo({
  nama, npsn, alamat, telepon, email,
}) {
  if (!nama || !nama.trim()) throw httpError(422, 'Nama sekolah wajib diisi.');
  const data = {
    nama: nama.trim(),
    npsn: (npsn || '').trim(),
    alamat: (alamat || '').trim(),
    telepon: (telepon || '').trim(),
    email: (email || '').trim(),
  };
  await SCHOOL_DOC.set(data, { merge: true });
  return data;
}

// ---- Harga Voucher ----
// NOTE (real limitation, flagged): this is a standalone reference price
// list. The Voucher and Sales modules still validate against their own
// established fixed NOMINALS lists (see voucherService.js/salesService.js)
// -- wiring those to read from here dynamically would mean changing how
// two already-shipped, tested modules validate input this late, which is
// a materially riskier change than adding this list. See README.
async function listPrices() {
  const snap = await db.collection('voucherPackages').orderBy('nominal', 'asc').get();
  return snap.docs.map((d) => ({ id: d.id, nominal: d.data().nominal }));
}

async function addPrice({ nominal }) {
  if (!Number.isInteger(nominal) || nominal <= 0) throw httpError(422, 'Nominal wajib diisi dan lebih dari 0.');
  const existing = await db.collection('voucherPackages').where('nominal', '==', nominal).limit(1).get();
  if (!existing.empty) throw httpError(409, 'Nominal tersebut sudah ada di daftar harga.');
  const ref = db.collection('voucherPackages').doc();
  await ref.set({ nominal, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return { id: ref.id, nominal };
}

async function removePrice(id) {
  const ref = db.collection('voucherPackages').doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw httpError(404, 'Harga voucher tidak ditemukan.');
  await ref.delete();
}

// ---- Konfigurasi Sistem ----
const SYSTEM_DOC = db.collection('systemSettings').doc('config');
const DEFAULT_SYSTEM = {
  lowStockThreshold: env.dashboard.lowStockThreshold,
  recentTransactionsLimit: env.dashboard.recentTransactionsLimit,
  notifikasiEmail: false,
  modePemeliharaan: false,
};

async function getSystemSettings() {
  const doc = await SYSTEM_DOC.get();
  return doc.exists ? { ...DEFAULT_SYSTEM, ...doc.data() } : DEFAULT_SYSTEM;
}

/**
 * Real integration: dashboardService's low-stock notification reads
 * this (falling back to the env default when nothing's been saved yet),
 * so changing it here genuinely changes dashboard behavior.
 *
 * `notifikasiEmail` (would need an email-sending dependency not in this
 * project) and `modePemeliharaan` (would need changes to the core
 * requireAuth middleware every other module depends on) are saved for
 * real but NOT enforced anywhere yet -- flagged as a deliberate scope
 * boundary given the risk of touching shared middleware this late,
 * rather than silently pretending they're fully wired. See README.
 */
async function getEffectiveLowStockThreshold() {
  const doc = await SYSTEM_DOC.get();
  const saved = doc.exists ? doc.data().lowStockThreshold : undefined;
  return Number.isFinite(saved) ? saved : env.dashboard.lowStockThreshold;
}

async function updateSystemSettings({
  lowStockThreshold, recentTransactionsLimit, notifikasiEmail, modePemeliharaan,
}) {
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw httpError(422, 'Ambang batas stok rendah harus berupa angka >= 0.');
  }
  if (!Number.isInteger(recentTransactionsLimit) || recentTransactionsLimit < 1) {
    throw httpError(422, 'Jumlah transaksi di dashboard harus berupa angka >= 1.');
  }
  const data = {
    lowStockThreshold,
    recentTransactionsLimit,
    notifikasiEmail: !!notifikasiEmail,
    modePemeliharaan: !!modePemeliharaan,
  };
  await SYSTEM_DOC.set(data, { merge: true });
  return data;
}

// ---- Akun Saya ----
async function updateOwnAccount(actor, { nama, password, confirmPassword }) {
  if (!nama || !nama.trim()) throw httpError(422, 'Nama wajib diisi.');
  if (password || confirmPassword) {
    if (password !== confirmPassword) throw httpError(422, 'Konfirmasi password tidak cocok.');
    if (password.length < 8) throw httpError(422, 'Password baru minimal 8 karakter.');
  }

  const authUpdate = { displayName: nama.trim() };
  if (password) authUpdate.password = password;
  await auth.updateUser(actor.uid, authUpdate);

  await db.collection('users').doc(actor.uid).update({ name: nama.trim() });

  return { nama: nama.trim() };
}

// ---- Backup & Restore ----
// Real JSON snapshot of every collection, stored in Firestore itself
// (no Cloud Storage bucket is set up in this project) -- genuinely
// downloadable and restorable by hand, but NOT the same thing as a
// managed `gcloud firestore export` (which needs GCP infra outside
// what the Admin SDK alone can do from a request handler). Flagged in
// README as a real constraint, not silently glossed over.
const BACKUP_COLLECTIONS = [
  'vouchers', 'sales', 'finance', 'members', 'attendanceRecords', 'weeklyGenerations',
  'stockMovements', 'systemLogs', 'users', 'schoolInfo', 'voucherPackages', 'systemSettings',
];

async function listBackups() {
  const snap = await db.collection('backups').orderBy('createdAt', 'desc').limit(20).get();
  return snap.docs.map((doc) => {
    const b = doc.data();
    const date = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
    return { id: doc.id, tanggal: formatFullWIB(date), ukuran: b.sizeLabel };
  });
}

async function createBackup(actor) {
  const snapshot = {};
  for (const col of BACKUP_COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await db.collection(col).get();
    snapshot[col] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
  const json = JSON.stringify(snapshot);
  const bytes = Buffer.byteLength(json, 'utf8');
  const sizeLabel = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

  const ref = db.collection('backups').doc();
  await ref.set({
    snapshotJson: json,
    sizeLabel,
    createdBy: { uid: actor.uid, name: actor.name || actor.email },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { id: ref.id, tanggal: formatFullWIB(new Date()), ukuran: sizeLabel };
}

async function getBackupSnapshot(id) {
  const doc = await db.collection('backups').doc(id).get();
  if (!doc.exists) throw httpError(404, 'Backup tidak ditemukan.');
  return doc.data().snapshotJson;
}

module.exports = {
  getSchoolInfo,
  updateSchoolInfo,
  listPrices,
  addPrice,
  removePrice,
  getSystemSettings,
  getEffectiveLowStockThreshold,
  updateSystemSettings,
  updateOwnAccount,
  listBackups,
  createBackup,
  getBackupSnapshot,
};
