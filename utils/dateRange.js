// SMK IBG 3 operates in WIB (Asia/Jakarta, UTC+7). Firestore stores
// Timestamps in UTC, so "today" has to be computed as a fixed UTC+7
// offset rather than relying on the server's local timezone.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Start of "today" in WIB, returned as a UTC Date usable in Firestore queries. */
function startOfTodayWIB(now = new Date()) {
  const wibNow = new Date(now.getTime() + WIB_OFFSET_MS);
  const startWIB = Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate());
  return new Date(startWIB - WIB_OFFSET_MS);
}

/** Start of the WIB day N days ago (0 = today). */
function startOfDayWIB(daysAgo, now = new Date()) {
  const start = startOfTodayWIB(now);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  return start;
}

/** 'YYYY-MM-DD' key for a Date, expressed in WIB, for grouping/bucketing. */
function dayKeyWIB(date) {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return wib.toISOString().slice(0, 10);
}

/** Start of a WIB calendar month, `monthsAgo` months back (0 = current month), as a UTC Date. */
function startOfMonthWIB(monthsAgo = 0, now = new Date()) {
  const wibNow = new Date(now.getTime() + WIB_OFFSET_MS);
  const startWIB = Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth() - monthsAgo, 1);
  return new Date(startWIB - WIB_OFFSET_MS);
}

/** Short Indonesian label like "27 Mei" for a WIB day, for chart axis labels. */
function shortLabelWIB(date) {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${wib.getUTCDate()} ${months[wib.getUTCMonth()]}`;
}

/**
 * Full Indonesian date+time label like "3 Jun 2024, 09:07", in WIB.
 * Shared by dashboardService (recent transactions) and voucherService
 * (voucher "Tanggal Dibuat" column) so the same timestamp always reads
 * the same way everywhere in the app.
 */
function formatFullWIB(date) {
  const d = new Date(date.getTime() + WIB_OFFSET_MS);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** 'YYYY-MM-DD' key for a Date, expressed in WIB — used for human-readable code prefixes. */
function dayKeyCompactWIB(date) {
  return dayKeyWIB(date).replace(/-/g, '');
}

/** The Monday (WIB) of the week containing `date` — the canonical identifier for a weekly attendance session. */
function mondayOfWeekWIB(date = new Date()) {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const dow = wib.getUTCDay(); // 0 = Sunday
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const mondayWIB = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() + diffToMonday);
  return dayKeyWIB(new Date(mondayWIB - WIB_OFFSET_MS));
}

/** Long-form Indonesian date label, e.g. "3 Juni 2026" (matches the approved Attendance UI's date header format). */
function formatLongDateWIB(date) {
  const d = new Date(date.getTime() + WIB_OFFSET_MS);
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Short Indonesian date label, e.g. "3 Jun 2026" — matches the approved generator UI's compact range format. */
function formatShortDateWIB(date) {
  const d = new Date(date.getTime() + WIB_OFFSET_MS);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Monday (WIB) that the current semester's "Minggu Ke 1" starts on.
 * Indonesian schools run two semesters a year (Genap: Jan-Jun, Ganjil:
 * Jul-Dec); week 1 is the first Monday on/after the semester's 1st.
 * There's no term-start config anywhere in the spec (that'd belong to
 * the Settings module), so this is computed rather than hand-entered.
 */
function semesterStartMondayWIB(now = new Date()) {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const year = wib.getUTCFullYear();
  const isGenap = wib.getUTCMonth() <= 5; // Jan(0)-Jun(5)
  const startMonthUTC = Date.UTC(year, isGenap ? 0 : 6, 1);
  const dow = new Date(startMonthUTC).getUTCDay(); // 0=Sun..6=Sat
  const shiftDays = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  const mondayUTC = startMonthUTC + shiftDays * 24 * 60 * 60 * 1000;
  return new Date(mondayUTC - WIB_OFFSET_MS);
}

/** 1-based semester week number for `date`'s WIB week (clamped to 1..maxWeeks). */
function semesterWeekNumberWIB(date = new Date(), maxWeeks = 24) {
  const semesterStart = semesterStartMondayWIB(date);
  const thisMonday = new Date(`${mondayOfWeekWIB(date)}T00:00:00.000Z`);
  const diffDays = Math.round((thisMonday.getTime() + WIB_OFFSET_MS - (semesterStart.getTime() + WIB_OFFSET_MS)) / (24 * 60 * 60 * 1000));
  const weekNum = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(weekNum, 1), maxWeeks);
}

/** Monday (WIB, 'YYYY-MM-DD') for semester week `weekNumber` (1-based). */
function mondayOfSemesterWeekWIB(weekNumber, now = new Date()) {
  const semesterStart = semesterStartMondayWIB(now);
  const target = new Date(semesterStart.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);
  return dayKeyWIB(target);
}

module.exports = {
  startOfTodayWIB,
  startOfDayWIB,
  startOfMonthWIB,
  dayKeyWIB,
  shortLabelWIB,
  formatFullWIB,
  dayKeyCompactWIB,
  mondayOfWeekWIB,
  formatLongDateWIB,
  formatShortDateWIB,
  semesterStartMondayWIB,
  semesterWeekNumberWIB,
  mondayOfSemesterWeekWIB,
  WIB_OFFSET_MS,
};
