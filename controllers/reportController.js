const reportService = require('../services/reportService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getReport = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const data = await reportService.getReport(req.params.key, dateFrom, dateTo);
  return ok(res, data);
});

const exportPdf = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const buffer = await reportService.exportPdfBuffer(req.params.key, dateFrom, dateTo);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="laporan-${req.params.key}.pdf"`);
  res.send(buffer);
});

const exportExcel = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const buffer = await reportService.exportExcelBuffer(req.params.key, dateFrom, dateTo);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="laporan-${req.params.key}.xlsx"`);
  res.send(buffer);
});

module.exports = { getReport, exportPdf, exportExcel };
