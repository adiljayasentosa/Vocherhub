const { db, admin } = require('../config/firebase-admin');
const {
  mondayOfWeekWIB, formatLongDateWIB, startOfMonthWIB, dayKeyWIB,
} = require('../utils/dateRange');

const KELAS = ['XI TKJ 1', 'XI TKJ 2', 'XI RPL'];
const STATUSES = ['Hadir', 'Izin', 'Sakit', 'Alpa'];
const DAYS = ['senin', 'jumat'];
const DAY_LABEL = { senin: 'Senin', jumat: 'Jumat' };

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function assertValidDay(day) {
  if (!DAYS.includes(day)) throw httpError(422, 'Hari tidak valid.');
}

/**
 * There is no separate member-management module anywhere in the 10-module
 * spec, so — per the approved UI's own "Tambah Presensi" form (Nama +
 * Kelas + Status + Keterangan, no member picker) — that form is the only
 * way a member ever enters the system: it creates the roster entry AND
 * that day's attendance record together, in one action.
 */
async function addAttendance(day, {
  nama, kelas, status, keterangan,
}, actor) {
  assertValidDay(day);
  if (!nama || !nama.trim()) throw httpError(422, 'Nama wajib diisi.');
  if (!KELAS.includes(kelas)) throw httpError(422, `Kelas tidak valid. Pilihan: ${KELAS.join(', ')}.`);
  if (!STATUSES.includes(status)) throw httpError(422, `Status tidak valid. Pilihan: ${STATUSES.join(', ')}.`);

  const weekOf = mondayOfWeekWIB();
  const memberRef = db.collection('members').doc();
  await memberRef.set({
    nama: nama.trim(),
    kelas,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const recordRef = db.collection('attendanceRecords').doc();
  await recordRef.set({
    memberId: memberRef.id,
    memberName: nama.trim(),
    kelas,
    day,
    weekOf,
    status,
    keterangan: (keterangan || '').trim() || '-',
    createdBy: { uid: actor.uid, name: actor.name || actor.email },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return recordRef.id;
}

async function updateStatus(recordId, { status, keterangan }, actor) {
  if (!STATUSES.includes(status)) throw httpError(422, `Status tidak valid. Pilihan: ${STATUSES.join(', ')}.`);
  const ref = db.collection('attendanceRecords').doc(recordId);
  const doc = await ref.get();
  if (!doc.exists) throw httpError(404, 'Data presensi tidak ditemukan.');

  await ref.update({
    status,
    keterangan: (keterangan || '').trim() || '-',
    updatedBy: { uid: actor.uid, name: actor.name || actor.email },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function statCounts(records) {
  const counts = {
    Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0,
  };
  records.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return { ...counts, total: records.length };
}

/** This week's session (Monday or Friday): the current roster's attendance for `day`, `weekOf` computed live from today. */
async function getSession(day) {
  assertValidDay(day);
  const weekOf = mondayOfWeekWIB();
  const snap = await db.collection('attendanceRecords')
    .where('day', '==', day)
    .where('weekOf', '==', weekOf)
    .get();

  const members = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
    .map((r, i) => ({
      no: i + 1,
      id: r.id,
      nama: r.memberName,
      kelas: r.kelas,
      status: r.status,
      keterangan: r.keterangan,
    }));

  // Reference date shown in the header: the actual Monday/Friday of this
  // real week, not a hardcoded placeholder like the approved mock's "3 Juni 2024".
  const referenceDate = new Date(`${weekOf}T00:00:00`);
  if (day === 'jumat') referenceDate.setDate(referenceDate.getDate() + 4);

  return {
    weekOf,
    dayLabel: DAY_LABEL[day],
    dateLabel: formatLongDateWIB(referenceDate),
    stats: statCounts(members),
    members,
  };
}

/**
 * Monthly recap: for every member with at least one record this month,
 * their Hadir/Izin/Sakit/Alpa counts and attendance percentage across
 * every weekly session (Senin + Jumat) recorded so far this month.
 */
async function getMonthlyRecap() {
  const monthStart = startOfMonthWIB(0);
  const monthStartKey = dayKeyWIB(monthStart);

  const snap = await db.collection('attendanceRecords').where('weekOf', '>=', monthStartKey).get();

  const byMember = new Map();
  snap.docs.forEach((doc) => {
    const r = doc.data();
    if (!byMember.has(r.memberId)) {
      byMember.set(r.memberId, {
        nama: r.memberName, kelas: r.kelas, Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0,
      });
    }
    const entry = byMember.get(r.memberId);
    entry[r.status] = (entry[r.status] || 0) + 1;
  });

  return [...byMember.values()].map((m) => {
    const total = m.Hadir + m.Izin + m.Sakit + m.Alpa;
    return { ...m, persenKehadiran: total ? Math.round((m.Hadir / total) * 100) : 0 };
  }).sort((a, b) => a.nama.localeCompare(b.nama));
}

module.exports = {
  KELAS,
  STATUSES,
  DAYS,
  addAttendance,
  updateStatus,
  getSession,
  getMonthlyRecap,
};
