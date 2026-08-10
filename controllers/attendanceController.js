const attendanceService = require('../services/attendanceService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getSession = asyncHandler(async (req, res) => {
  const data = await attendanceService.getSession(req.params.day);
  return ok(res, data);
});

const addAttendance = asyncHandler(async (req, res) => {
  const {
    nama, kelas, status, keterangan,
  } = req.body;
  await attendanceService.addAttendance(req.params.day, {
    nama, kelas, status, keterangan,
  }, req.user);
  return ok(res, null, 'Presensi berhasil ditambahkan.', 201);
});

const updateStatus = asyncHandler(async (req, res) => {
  const { status, keterangan } = req.body;
  await attendanceService.updateStatus(req.params.id, { status, keterangan }, req.user);
  return ok(res, null, 'Status presensi diperbarui.');
});

const getMonthlyRecap = asyncHandler(async (req, res) => {
  const data = await attendanceService.getMonthlyRecap();
  return ok(res, data);
});

module.exports = {
  getSession, addAttendance, updateStatus, getMonthlyRecap,
};
