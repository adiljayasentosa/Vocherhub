const { db, admin } = require('../config/firebase-admin');
const {
  formatShortDateWIB, formatLongDateWIB, semesterWeekNumberWIB, mondayOfSemesterWeekWIB,
} = require('../utils/dateRange');
const { renderTablePdf, renderTableExcel } = require('../utils/exportHelpers');
const { KELAS } = require('./attendanceService');

const MAX_WEEKS = 24;
const JENIS_TO_DAY = { 'Presensi Senin': 'senin', 'Presensi Jumat': 'jumat' };
const JENIS = Object.keys(JENIS_TO_DAY);
const KELAS_OPTIONS = ['Semua Kelas', ...KELAS];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertValidWeek(weekNumber) {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEKS) {
    throw httpError(422, `Minggu tidak valid. Pilih 1-${MAX_WEEKS}.`);
  }
}
function assertValidJenis(jenis) {
  if (!JENIS_TO_DAY[jenis]) throw httpError(422, `Jenis presensi tidak valid. Pilihan: ${JENIS.join(', ')}.`);
}
function assertValidKelas(kelas) {
  if (!KELAS_OPTIONS.includes(kelas)) throw httpError(422, `Kelas tidak valid. Pilihan: ${KELAS_OPTIONS.join(', ')}.`);
}

/** Monday..Sunday range for semester week N, e.g. "3 Agu 2026 - 9 Agu 2026". */
function weekRangeLabel(weekNumber, now = new Date()) {
  const mondayKey = mondayOfSemesterWeekWIB(weekNumber, now);
  const monday = new Date(`${mondayKey}T00:00:00.000Z`);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${formatShortDateWIB(monday)} - ${formatShortDateWIB(sunday)}`;
}

/** The 24 selectable weeks, for the dropdown — computed live, not hardcoded like the approved mock's fixed "23/24". */
function getWeekOptions() {
  const now = new Date();
  const currentWeek = semesterWeekNumberWIB(now, MAX_WEEKS);
  const options = [];
  for (let n = 1; n <= MAX_WEEKS; n++) {
    options.push({
      value: n, label: `Minggu Ke ${n}`, rangeLabel: weekRangeLabel(n, now), isCurrent: n === currentWeek,
    });
  }
  return { options, currentWeek };
}

/** Roster members matching `kelas` ("Semua Kelas" or one specific class). */
async function getRosterMembers(kelas) {
  let query = db.collection('members');
  if (kelas !== 'Semua Kelas') query = query.where('kelas', '==', kelas);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Existing attendanceRecords for a given week+day, keyed by memberId. */
async function getExistingRecordsByMember(weekOf, day) {
  const snap = await db.collection('attendanceRecords').where('weekOf', '==', weekOf).where('day', '==', day).get();
  const map = new Map();
  snap.docs.forEach((d) => map.set(d.data().memberId, { id: d.id, ...d.data() }));
  return map;
}

/**
 * Preview: real roster members (filtered by kelas) with their actual
 * current status for that week+day if a record already exists, or
 * "Belum diisi" if this session hasn't been generated/filled yet — real
 * data, not the approved mock's 5 hardcoded fake names.
 */
async function getPreview({ weekNumber, jenis, kelas }) {
  assertValidWeek(weekNumber);
  assertValidJenis(jenis);
  assertValidKelas(kelas);
  const day = JENIS_TO_DAY[jenis];
  const weekOf = mondayOfSemesterWeekWIB(weekNumber);

  const [members, existingByMember] = await Promise.all([
    getRosterMembers(kelas),
    getExistingRecordsByMember(weekOf, day),
  ]);

  return members
    .sort((a, b) => a.nama.localeCompare(b.nama))
    .map((m, i) => {
      const existing = existingByMember.get(m.id);
      return {
        no: i + 1, nama: m.nama, kelas: m.kelas, status: existing ? existing.status : 'Belum diisi',
      };
    });
}

/**
 * Creates attendanceRecords (default "Hadir") for every roster member
 * matching `kelas` who doesn't already have one for this week+day —
 * additive/idempotent, so generating twice (or generating after some
 * members were already added by hand via the Attendance page) never
 * duplicates or overwrites existing entries.
 */
async function generate({ weekNumber, jenis, kelas }, actor) {
  assertValidWeek(weekNumber);
  assertValidJenis(jenis);
  assertValidKelas(kelas);
  const day = JENIS_TO_DAY[jenis];
  const weekOf = mondayOfSemesterWeekWIB(weekNumber);

  const [members, existingByMember] = await Promise.all([
    getRosterMembers(kelas),
    getExistingRecordsByMember(weekOf, day),
  ]);

  const toCreate = members.filter((m) => !existingByMember.has(m.id));
  const batch = db.batch();
  toCreate.forEach((m) => {
    const ref = db.collection('attendanceRecords').doc();
    batch.set(ref, {
      memberId: m.id,
      memberName: m.nama,
      kelas: m.kelas,
      day,
      weekOf,
      status: 'Hadir',
      keterangan: '-',
      createdBy: { uid: actor.uid, name: actor.name || actor.email },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  if (toCreate.length) await batch.commit();

  const rangeLabel = weekRangeLabel(weekNumber);
  const genRef = db.collection('weeklyGenerations').doc();
  await genRef.set({
    weekNumber,
    weekOf,
    rangeLabel,
    jenis,
    kelas,
    generatedCount: toCreate.length,
    totalMembers: members.length,
    createdBy: { uid: actor.uid, name: actor.name || actor.email },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return docToResult(await genRef.get());
}

function docToResult(doc) {
  const g = doc.data();
  const date = g.createdAt?.toDate ? g.createdAt.toDate() : new Date();
  return {
    minggu: `Minggu Ke ${g.weekNumber}`,
    rentang: g.rangeLabel,
    jenis: g.jenis,
    kelas: g.kelas,
    jumlahDigenerate: g.generatedCount,
    totalAnggota: g.totalMembers,
    dibuatOleh: g.createdBy?.name || '-',
    dibuatPada: formatLongDateWIB(date),
  };
}

/** Most recent generation, for the result panel on page load — persisted, not reset every session like the mock's in-memory variable. */
async function getLastGeneration() {
  const snap = await db.collection('weeklyGenerations').orderBy('createdAt', 'desc').limit(1).get();
  if (snap.empty) return null;
  return docToResult(snap.docs[0]);
}

async function buildExportRows({ weekNumber, jenis, kelas }) {
  const rows = await getPreview({ weekNumber, jenis, kelas });
  return {
    rows,
    title: `${jenis} - Minggu Ke ${weekNumber}`,
    rangeLabel: weekRangeLabel(weekNumber),
    kelas,
  };
}

async function exportPdfBuffer(params) {
  const { rows, title, rangeLabel } = await buildExportRows(params);
  return renderTablePdf({
    title,
    subtitle: rangeLabel,
    columns: [
      { key: 'no', label: 'No', width: 30 },
      { key: 'nama', label: 'Nama', width: 200 },
      { key: 'kelas', label: 'Kelas', width: 120 },
      { key: 'status', label: 'Status', width: 100 },
      { key: 'paraf', label: 'Paraf', width: 65 },
    ],
    rows: rows.map((r) => ({ ...r, paraf: '' })),
  });
}

async function exportExcelBuffer(params) {
  const { rows, title, rangeLabel } = await buildExportRows(params);
  return renderTableExcel({
    title,
    subtitle: rangeLabel,
    sheetName: 'Presensi',
    columns: [
      { key: 'no', label: 'No', excelWidth: 6 },
      { key: 'nama', label: 'Nama', excelWidth: 30 },
      { key: 'kelas', label: 'Kelas', excelWidth: 15 },
      { key: 'status', label: 'Status', excelWidth: 15 },
    ],
    rows,
  });
}

module.exports = {
  JENIS,
  KELAS_OPTIONS,
  MAX_WEEKS,
  getWeekOptions,
  getPreview,
  generate,
  getLastGeneration,
  exportPdfBuffer,
  exportExcelBuffer,
};
