const userService = require('../services/userService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const data = await userService.getStats();
  return ok(res, data);
});

const list = asyncHandler(async (req, res) => {
  const {
    search, role, page, pageSize,
  } = req.query;
  const data = await userService.list({
    search: search || '',
    role: role || 'Semua Role',
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 5,
  });
  return ok(res, data);
});

const getById = asyncHandler(async (req, res) => {
  const data = await userService.getById(req.params.id);
  return ok(res, data);
});

const create = asyncHandler(async (req, res) => {
  const {
    nama, email, role, status,
  } = req.body;
  const data = await userService.create({
    nama, email, role, status,
  }, req.user);
  return ok(res, data, 'Pengguna berhasil ditambahkan.', 201);
});

const update = asyncHandler(async (req, res) => {
  const {
    nama, email, role, status,
  } = req.body;
  const data = await userService.update(req.params.id, {
    nama, email, role, status,
  }, req.user);
  return ok(res, data, 'Perubahan pengguna disimpan.');
});

const remove = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id, req.user);
  return ok(res, null, 'Pengguna berhasil dihapus.');
});

module.exports = {
  getStats, list, getById, create, update, remove,
};
