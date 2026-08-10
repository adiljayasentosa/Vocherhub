const generatorService = require('../services/attendanceGeneratorService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getWeeks = asyncHandler(async (req, res) => {
  const data = generatorService.getWeekOptions();
  return ok(res, data);
});

const getLast = asyncHandler(async (req, res) => {
  const data = await generatorService.getLastGeneration();
  return ok(res, data);
});

function parseGenParams(query) {
  return {
    weekNumber: parseInt(query.minggu, 10),
    jenis: query.jenis,
    kelas: query.kelas,
  };
}

const getPreview = asyncHandler(async (req, res) => {
  const data = await generatorService.getPreview(parseGenParams(req.query));
  return ok(res, data);
});

const generate = asyncHandler(async (req, res) => {
  const { minggu, jenis, kelas } = req.body;
  const data = await generatorService.generate({
    weekNumber: parseInt(minggu, 10), jenis, kelas,
  }, req.user);
  return ok(res, data, 'Absensi berhasil di-generate.', 201);
});

const exportPdf = asyncHandler(async (req, res) => {
  const params = parseGenParams(req.query);
  const buffer = await generatorService.exportPdfBuffer(params);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="presensi-minggu-${params.weekNumber}.pdf"`);
  res.send(buffer);
});

const exportExcel = asyncHandler(async (req, res) => {
  const params = parseGenParams(req.query);
  const buffer = await generatorService.exportExcelBuffer(params);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="presensi-minggu-${params.weekNumber}.xlsx"`);
  res.send(buffer);
});

module.exports = {
  getWeeks, getLast, getPreview, generate, exportPdf, exportExcel,
};
