const salesService = require('../services/salesService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const data = await salesService.getStats();
  return ok(res, data);
});

const getChart = asyncHandler(async (req, res) => {
  const data = await salesService.getRevenueChart(7);
  return ok(res, data);
});

const list = asyncHandler(async (req, res) => {
  const {
    search, dateFrom, dateTo, page, pageSize,
  } = req.query;
  const data = await salesService.list({
    search: search || '',
    dateFrom: dateFrom ? new Date(dateFrom) : null,
    dateTo: dateTo ? new Date(dateTo) : null,
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 5,
  });
  return ok(res, data);
});

const getById = asyncHandler(async (req, res) => {
  const data = await salesService.getById(req.params.id);
  return ok(res, data);
});

const sell = asyncHandler(async (req, res) => {
  const { nominal, pembeli, metode } = req.body;
  const data = await salesService.sell(
    { nominal: parseInt(nominal, 10), pembeli, metode },
    req.user,
  );
  return ok(res, data, 'Penjualan voucher berhasil dicatat.', 201);
});

module.exports = {
  getStats, getChart, list, getById, sell,
};
