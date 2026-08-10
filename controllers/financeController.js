const financeService = require('../services/financeService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const data = await financeService.getStats();
  return ok(res, data);
});

const getCashFlow = asyncHandler(async (req, res) => {
  const data = await financeService.getCashFlow(30);
  return ok(res, data);
});

const getMonthlySummary = asyncHandler(async (req, res) => {
  const data = await financeService.getMonthlySummary();
  return ok(res, data);
});

const getRecentActivity = asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const data = await financeService.getRecentActivity(limit ? parseInt(limit, 10) : 4);
  return ok(res, data);
});

const listIncome = asyncHandler(async (req, res) => {
  const data = await financeService.listEntries('income');
  return ok(res, data);
});

const listExpense = asyncHandler(async (req, res) => {
  const data = await financeService.listEntries('expense');
  return ok(res, data);
});

const addIncome = asyncHandler(async (req, res) => {
  const {
    tanggal, sumber, deskripsi, jumlah,
  } = req.body;
  await financeService.addIncome(
    {
      tanggal, label: sumber, deskripsi, jumlah: parseInt(jumlah, 10),
    },
    req.user,
  );
  return ok(res, null, 'Pemasukan berhasil ditambahkan.', 201);
});

const addExpense = asyncHandler(async (req, res) => {
  const {
    tanggal, kategori, deskripsi, jumlah,
  } = req.body;
  await financeService.addExpense(
    {
      tanggal, label: kategori, deskripsi, jumlah: parseInt(jumlah, 10),
    },
    req.user,
  );
  return ok(res, null, 'Pengeluaran berhasil ditambahkan.', 201);
});

module.exports = {
  getStats,
  getCashFlow,
  getMonthlySummary,
  getRecentActivity,
  listIncome,
  listExpense,
  addIncome,
  addExpense,
};
