const voucherService = require('../services/voucherService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const data = await voucherService.getStats();
  return ok(res, data);
});

const list = asyncHandler(async (req, res) => {
  const { search, status, page, pageSize } = req.query;
  const data = await voucherService.list({
    search: search || '',
    status: status || 'Semua Status',
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 5,
  });
  return ok(res, data);
});

const getById = asyncHandler(async (req, res) => {
  const data = await voucherService.getById(req.params.id);
  return ok(res, data);
});

const create = asyncHandler(async (req, res) => {
  const { nominal, jumlah, status } = req.body;
  const data = await voucherService.create(
    { nominal: parseInt(nominal, 10), jumlah: parseInt(jumlah, 10), status },
    req.user,
  );
  return ok(res, data, 'Voucher berhasil dibuat.', 201);
});

const update = asyncHandler(async (req, res) => {
  const { nominal, status } = req.body;
  const data = await voucherService.update(
    req.params.id,
    { nominal: parseInt(nominal, 10), status },
    req.user,
  );
  return ok(res, data, 'Perubahan voucher disimpan.');
});

const remove = asyncHandler(async (req, res) => {
  await voucherService.remove(req.params.id, req.user);
  return ok(res, null, 'Voucher berhasil dihapus.');
});

module.exports = { getStats, list, getById, create, update, remove };
