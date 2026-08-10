const systemLogsService = require('../services/systemLogsService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getFilterOptions = asyncHandler(async (req, res) => {
  const users = await systemLogsService.getFilterUsers();
  return ok(res, { users, severities: systemLogsService.SEVERITIES });
});

const list = asyncHandler(async (req, res) => {
  const {
    search, user, severity, dateFrom, dateTo, page, pageSize,
  } = req.query;
  const data = await systemLogsService.list({
    search: search || '',
    user: user || 'Semua Pengguna',
    severity: severity || 'Semua Tipe',
    dateFrom: dateFrom ? new Date(dateFrom) : null,
    dateTo: dateTo ? new Date(dateTo) : null,
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 8,
  });
  return ok(res, data);
});

module.exports = { getFilterOptions, list };
