const { db, admin } = require('../config/firebase-admin');
const logService = require('./logService');
const stockMovementService = require('./stockMovementService');
const { formatFullWIB, dayKeyCompactWIB } = require('../utils/dateRange');

// Kept in sync with the fixed nominal list already hardcoded into the
// approved Phase 2.1 UI (public/js/voucher.js NOMINALS). This is backend
// validation, not a UI change — Settings (Phase 3 module 9) will make this
// configurable later; for now both sides agree on the same fixed set.
const NOMINALS = [3000, 5000, 6000, 10000, 20000];

// Storage truth stays the English enum the Phase 2 dashboard already
// queries against (`status == "available"`, `status != "expired"`) so
// dashboardService keeps working untouched. The approved UI only ever
// shows/sends the Indonesian labels, so translation happens right here,
// at the API boundary, in both directions.
const STATUS_TO_STORAGE = { Aktif: 'available', Terjual: 'sold', Nonaktif: 'expired' };
const STATUS_TO_DISPLAY = { available: 'Aktif', sold: 'Terjual', expired: 'Nonaktif' };
const DISPLAY_STATUSES = Object.keys(STATUS_TO_STORAGE);

const MAX_BATCH_CREATE = 500; // sane upper bound on one "Tambah Voucher" submit

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function toStorageStatus(display) {
  const storage = STATUS_TO_STORAGE[display];
  if (!storage) throw httpError(422, `Status tidak valid: ${display}`);
  return storage;
}

function toDisplayStatus(storage) {
  return STATUS_TO_DISPLAY[storage] || storage;
}

/** Whether a storage status counts toward "stok" (available/sellable) for the Inventory module. */
function isAvailable(storageStatus) {
  return storageStatus === 'available';
}

function assertValidNominal(nominal) {
  if (!NOMINALS.includes(nominal)) {
    throw httpError(422, `Nominal tidak valid. Pilihan yang tersedia: ${NOMINALS.join(', ')}.`);
  }
}

function docToView(doc) {
  const v = doc.data();
  const createdAt = v.createdAt ? v.createdAt.toDate() : new Date();
  return {
    id: doc.id,
    code: v.code,
    nominal: v.nominal,
    status: toDisplayStatus(v.status),
    tanggal: formatFullWIB(createdAt),
    dibuatOleh: v.createdBy?.name || '-',
  };
}

/**
 * Atomically reserves a contiguous block of `count` sequential numbers
 * from counters/vouchers, so a batch create never collides with another
 * concurrent create even under load.
 */
async function reserveSequenceBlock(count) {
  const ref = db.collection('counters').doc('vouchers');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.exists ? snap.data().lastSequence || 0 : 0;
    tx.set(ref, { lastSequence: last + count }, { merge: true });
    return last; // first new code is last + 1
  });
}

async function getStats() {
  const col = db.collection('vouchers');
  const [totalSnap, aktifSnap, terjualSnap, nonaktifSnap] = await Promise.all([
    col.count().get(),
    col.where('status', '==', 'available').count().get(),
    col.where('status', '==', 'sold').count().get(),
    col.where('status', '==', 'expired').count().get(),
  ]);
  return {
    total: totalSnap.data().count,
    aktif: aktifSnap.data().count,
    terjual: terjualSnap.data().count,
    nonaktif: nonaktifSnap.data().count,
  };
}

/**
 * Paginated, searchable, filterable voucher list.
 * NOTE: Firestore has no substring full-text search, so `search` is a
 * prefix match on `code` (range query). Prefix search requires the query
 * to be ordered by `code`; the default (no search) sort is createdAt desc.
 * Filtering by status + searching by code together needs a Firestore
 * composite index — Firestore will log a console error with a direct
 * link to create it the first time that combination runs against a real
 * project (expected one-time ops step, not a bug).
 */
async function list({ search = '', status = 'Semua Status', page = 1, pageSize = 5 } = {}) {
  let query = db.collection('vouchers');

  if (status && status !== 'Semua Status') {
    query = query.where('status', '==', toStorageStatus(status));
  }

  const term = search.trim().toUpperCase();
  if (term) {
    query = query.where('code', '>=', term).where('code', '<=', term + '\uf8ff').orderBy('code');
  } else {
    query = query.orderBy('createdAt', 'desc');
  }

  const totalSnap = await query.count().get();
  const totalItems = totalSnap.data().count;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageSnap = await query.offset((safePage - 1) * pageSize).limit(pageSize).get();

  return {
    items: pageSnap.docs.map(docToView),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  };
}

async function getById(id) {
  const doc = await db.collection('vouchers').doc(id).get();
  if (!doc.exists) throw httpError(404, 'Voucher tidak ditemukan.');
  return docToView(doc);
}

/** Creates `jumlah` vouchers at once, all sharing the same nominal + initial status. */
async function create({ nominal, jumlah, status = 'Aktif' }, actor) {
  assertValidNominal(nominal);
  if (!Number.isInteger(jumlah) || jumlah < 1) {
    throw httpError(422, 'Jumlah voucher wajib diisi, minimal 1.');
  }
  if (jumlah > MAX_BATCH_CREATE) {
    throw httpError(422, `Maksimal ${MAX_BATCH_CREATE} voucher per kali buat.`);
  }
  const storageStatus = toStorageStatus(status);

  const startSeq = await reserveSequenceBlock(jumlah);
  const datePrefix = dayKeyCompactWIB(new Date());
  const createdBy = { uid: actor.uid, name: actor.name || actor.email };

  const batch = db.batch();
  const col = db.collection('vouchers');
  for (let i = 0; i < jumlah; i++) {
    const seq = startSeq + i + 1;
    const ref = col.doc();
    batch.set(ref, {
      code: `VCH-${datePrefix}-${String(seq).padStart(4, '0')}`,
      nominal,
      status: storageStatus,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      soldAt: null,
      createdBy,
    });
  }
  await batch.commit();

  await logService.log('voucher_created', {
    uid: actor.uid,
    email: actor.email,
    message: `${jumlah} voucher dibuat (nominal Rp ${nominal.toLocaleString('id-ID')}, status ${status})`,
  });

  if (isAvailable(storageStatus)) {
    await stockMovementService.record({
      nominal, action: 'Ditambahkan', delta: jumlah, actorName: createdBy.name,
    });
  }

  return { count: jumlah };
}

async function update(id, { nominal, status }, actor) {
  const ref = db.collection('vouchers').doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw httpError(404, 'Voucher tidak ditemukan.');

  const current = doc.data();
  if (current.status === 'sold') {
    throw httpError(409, 'Voucher yang sudah terjual tidak dapat diubah.');
  }

  assertValidNominal(nominal);
  const storageStatus = toStorageStatus(status);

  await ref.update({ nominal, status: storageStatus });

  await logService.log('voucher_updated', {
    uid: actor.uid,
    email: actor.email,
    message: `Voucher ${current.code} diubah (nominal Rp ${nominal.toLocaleString('id-ID')}, status ${status})`,
  });

  const delta = (isAvailable(storageStatus) ? 1 : 0) - (isAvailable(current.status) ? 1 : 0);
  if (delta !== 0) {
    const action = delta > 0 ? 'Diaktifkan' : (storageStatus === 'sold' ? 'Terjual' : 'Kedaluwarsa');
    await stockMovementService.record({
      nominal, action, delta, actorName: actor.name || actor.email,
    });
  }

  return docToView(await ref.get());
}

async function remove(id, actor) {
  const ref = db.collection('vouchers').doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw httpError(404, 'Voucher tidak ditemukan.');

  const current = doc.data();
  if (current.status === 'sold') {
    throw httpError(409, 'Voucher yang sudah terjual tidak dapat dihapus.');
  }

  await ref.delete();

  await logService.log('voucher_deleted', {
    uid: actor.uid,
    email: actor.email,
    message: `Voucher ${current.code} dihapus`,
  });

  if (isAvailable(current.status)) {
    await stockMovementService.record({
      nominal: current.nominal, action: 'Dihapus', delta: -1, actorName: actor.name || actor.email,
    });
  }
}

module.exports = {
  NOMINALS,
  DISPLAY_STATUSES,
  getStats,
  list,
  getById,
  create,
  update,
  remove,
};
