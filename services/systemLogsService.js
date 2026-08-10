const { db } = require('../config/firebase-admin');
const { formatFullWIB } = require('../utils/dateRange');

const SEVERITIES = ['Info', 'Warning', 'Error'];

// Real event types -> severity, based on what each type actually means
// (the approved mock assigned severity randomly per-row; this reflects
// the actual meaning of each real `type` value logService.js writes).
const TYPE_SEVERITY = {
  login_success: 'Info',
  login_failed: 'Warning',
  logout: 'Info',
  voucher_created: 'Info',
  voucher_updated: 'Info',
  voucher_deleted: 'Warning',
  sale_created: 'Info',
};

function severityOf(type) {
  return TYPE_SEVERITY[type] || 'Info';
}

// Recent-window cap for the in-memory search/filter pass below (see
// list()) -- systemLogs is the one collection in this app that grows
// unbounded (every action across every module writes here), so unlike
// Users (small, staff-scale) a full-collection fetch isn't appropriate.
const RECENT_WINDOW = 500;

/** Real users, for the "Pengguna" filter dropdown -- not the approved mock's fixed fake names. */
async function getFilterUsers() {
  const snap = await db.collection('users').get();
  const names = snap.docs.map((d) => d.data().name).filter(Boolean).sort();
  return [...new Set(names)].concat('Sistem');
}

async function docToRecord(doc, nameByUid) {
  const l = doc.data();
  const date = l.createdAt?.toDate ? l.createdAt.toDate() : new Date();
  return {
    id: doc.id,
    waktu: formatFullWIB(date),
    user: (l.uid && nameByUid.get(l.uid)) || l.email || 'Sistem',
    aktivitas: l.message || l.type,
    severity: severityOf(l.type),
    ip: l.ip || '-',
  };
}

/**
 * Paginated, searchable, filterable log list.
 * `dateFrom`/`dateTo` are real Firestore range filters (cheap, scales
 * fine). `search`/`user`/`severity` are applied in-memory over the most
 * recent RECENT_WINDOW entries (post date-filter) -- Firestore has no
 * native substring text search, and full-text search infrastructure
 * (Algolia/etc.) is out of scope here. This means search covers "the
 * most recent 500 events (within the date range, if set)", not
 * necessarily the entire all-time history -- a real, documented
 * trade-off, not a silent limitation.
 */
async function list({
  search = '', user = 'Semua Pengguna', severity = 'Semua Tipe', dateFrom = null, dateTo = null, page = 1, pageSize = 8,
} = {}) {
  let query = db.collection('systemLogs');
  if (dateFrom) query = query.where('createdAt', '>=', dateFrom);
  if (dateTo) query = query.where('createdAt', '<', dateTo);
  query = query.orderBy('createdAt', 'desc').limit(RECENT_WINDOW);

  const [snap, usersSnap] = await Promise.all([
    query.get(),
    db.collection('users').get(),
  ]);
  const nameByUid = new Map(usersSnap.docs.map((d) => [d.id, d.data().name]));

  let rows = await Promise.all(snap.docs.map((doc) => docToRecord(doc, nameByUid)));

  const term = search.trim().toLowerCase();
  if (term) rows = rows.filter((r) => r.aktivitas.toLowerCase().includes(term));
  if (user !== 'Semua Pengguna') rows = rows.filter((r) => r.user === user);
  if (severity !== 'Semua Tipe') rows = rows.filter((r) => r.severity === severity);

  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const items = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    items, page: safePage, pageSize, totalItems, totalPages,
  };
}

module.exports = { SEVERITIES, getFilterUsers, list };
