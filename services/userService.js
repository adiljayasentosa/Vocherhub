const crypto = require('crypto');
const { db, admin, auth } = require('../config/firebase-admin');
const { formatFullWIB } = require('../utils/dateRange');

const ROLES = ['Admin', 'Operator'];
const STATUSES = ['Aktif', 'Nonaktif'];
const ROLE_TO_STORAGE = { Admin: 'admin', Operator: 'operator' };
const ROLE_TO_DISPLAY = { admin: 'Admin', operator: 'Operator' };

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertValidRole(role) {
  if (!ROLE_TO_STORAGE[role]) throw httpError(422, `Role tidak valid. Pilihan: ${ROLES.join(', ')}.`);
}
function assertValidStatus(status) {
  if (!STATUSES.includes(status)) throw httpError(422, `Status tidak valid. Pilihan: ${STATUSES.join(', ')}.`);
}
function assertValidEmail(email) {
  if (!email || !email.includes('@')) throw httpError(422, 'Email wajib diisi dan valid.');
}

function docToView(doc) {
  const u = doc.data();
  return {
    id: doc.id,
    nama: u.name,
    email: u.email,
    role: ROLE_TO_DISPLAY[u.role] || u.role,
    status: u.active ? 'Aktif' : 'Nonaktif',
    login: u.lastLoginAt ? formatFullWIB(u.lastLoginAt.toDate()) : 'Belum pernah login',
  };
}

async function getStats() {
  const snap = await db.collection('users').get();
  const users = snap.docs.map((d) => d.data());
  return {
    total: users.length,
    admin: users.filter((u) => u.role === 'admin').length,
    operator: users.filter((u) => u.role === 'operator').length,
    nonaktif: users.filter((u) => !u.active).length,
  };
}

/**
 * Staff accounts are a handful at most (this is a school, not a customer
 * base) -- unlike Voucher/Sales, an in-memory filter over the full list
 * is simpler and entirely appropriate at this scale, vs. Firestore's
 * limited native text search.
 */
async function list({
  search = '', role = 'Semua Role', page = 1, pageSize = 5,
} = {}) {
  const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
  let rows = snap.docs.map(docToView);

  const term = search.trim().toLowerCase();
  if (term) {
    rows = rows.filter((u) => u.nama.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  }
  if (role !== 'Semua Role') {
    rows = rows.filter((u) => u.role === role);
  }

  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const items = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    items, page: safePage, pageSize, totalItems, totalPages,
  };
}

async function getById(id) {
  const doc = await db.collection('users').doc(id).get();
  if (!doc.exists) throw httpError(404, 'Pengguna tidak ditemukan.');
  return docToView(doc);
}

/**
 * Creates a REAL Firebase Auth account (with a securely-generated
 * temporary password -- the approved form has no password field) plus
 * the Firestore profile doc, so the new user can actually log in (via
 * "forgot password" on first attempt) rather than getting an inert
 * profile record with no way to ever authenticate.
 */
async function create({
  nama, email, role, status,
}, actor) {
  if (!nama || !nama.trim()) throw httpError(422, 'Nama wajib diisi.');
  assertValidEmail(email);
  assertValidRole(role);
  assertValidStatus(status || 'Aktif');

  let authUser;
  try {
    authUser = await auth.createUser({
      email: email.trim(),
      password: crypto.randomBytes(18).toString('base64url'),
      displayName: nama.trim(),
      disabled: (status || 'Aktif') === 'Nonaktif',
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      throw httpError(409, 'Email tersebut sudah terdaftar.');
    }
    throw err;
  }

  await db.collection('users').doc(authUser.uid).set({
    email: email.trim(),
    name: nama.trim(),
    role: ROLE_TO_STORAGE[role],
    active: (status || 'Aktif') === 'Aktif',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLoginAt: null,
    createdBy: { uid: actor.uid, name: actor.name || actor.email },
  });

  return getById(authUser.uid);
}

async function update(id, {
  nama, email, role, status,
}, actor) {
  if (!nama || !nama.trim()) throw httpError(422, 'Nama wajib diisi.');
  assertValidEmail(email);
  assertValidRole(role);
  assertValidStatus(status);

  const ref = db.collection('users').doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw httpError(404, 'Pengguna tidak ditemukan.');

  // Safety guard: you can edit your own name/email, but can't demote or
  // deactivate yourself -- a common real-world safeguard against
  // accidental lockout, not explicit in the spec but a sensible default.
  const isSelf = id === actor.uid;
  if (isSelf && (ROLE_TO_STORAGE[role] !== 'admin' || status !== 'Aktif')) {
    throw httpError(409, 'Anda tidak dapat menurunkan role atau menonaktifkan akun Anda sendiri.');
  }

  await auth.updateUser(id, {
    email: email.trim(),
    displayName: nama.trim(),
    disabled: status === 'Nonaktif',
  }).catch((err) => {
    if (err.code === 'auth/email-already-exists') throw httpError(409, 'Email tersebut sudah terdaftar.');
    throw err;
  });

  await ref.update({
    name: nama.trim(),
    email: email.trim(),
    role: ROLE_TO_STORAGE[role],
    active: status === 'Aktif',
  });

  return getById(id);
}

/**
 * Deletes only the Firestore app-access profile -- the approved
 * confirmation dialog's own text is explicit: "Akun Firebase
 * Authentication tidak ikut terhapus otomatis." The real identity stays
 * intact; only VoucherHub access is revoked.
 */
async function remove(id, actor) {
  if (id === actor.uid) throw httpError(409, 'Anda tidak dapat menghapus akun Anda sendiri.');

  const ref = db.collection('users').doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw httpError(404, 'Pengguna tidak ditemukan.');

  await ref.delete();
}

module.exports = {
  ROLES,
  STATUSES,
  getStats,
  list,
  getById,
  create,
  update,
  remove,
};
