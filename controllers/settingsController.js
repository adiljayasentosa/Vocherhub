const settingsService = require('../services/settingsService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getSchool = asyncHandler(async (req, res) => {
  const data = await settingsService.getSchoolInfo();
  return ok(res, data);
});

const updateSchool = asyncHandler(async (req, res) => {
  const data = await settingsService.updateSchoolInfo(req.body);
  return ok(res, data, 'Informasi sekolah disimpan.');
});

const listPrices = asyncHandler(async (req, res) => {
  const data = await settingsService.listPrices();
  return ok(res, data);
});

const addPrice = asyncHandler(async (req, res) => {
  const data = await settingsService.addPrice({ nominal: parseInt(req.body.nominal, 10) });
  return ok(res, data, 'Harga voucher baru ditambahkan.', 201);
});

const removePrice = asyncHandler(async (req, res) => {
  await settingsService.removePrice(req.params.id);
  return ok(res, null, 'Harga voucher dihapus.');
});

const getSystem = asyncHandler(async (req, res) => {
  const data = await settingsService.getSystemSettings();
  return ok(res, data);
});

const updateSystem = asyncHandler(async (req, res) => {
  const {
    lowStockThreshold, recentTransactionsLimit, notifikasiEmail, modePemeliharaan,
  } = req.body;
  const data = await settingsService.updateSystemSettings({
    lowStockThreshold: parseInt(lowStockThreshold, 10),
    recentTransactionsLimit: parseInt(recentTransactionsLimit, 10),
    notifikasiEmail,
    modePemeliharaan,
  });
  return ok(res, data, 'Konfigurasi sistem disimpan.');
});

const updateAccount = asyncHandler(async (req, res) => {
  const { nama, password, confirmPassword } = req.body;
  const data = await settingsService.updateOwnAccount(req.user, { nama, password, confirmPassword });
  return ok(res, data, 'Profil akun diperbarui.');
});

const listBackups = asyncHandler(async (req, res) => {
  const data = await settingsService.listBackups();
  return ok(res, data);
});

const createBackup = asyncHandler(async (req, res) => {
  const data = await settingsService.createBackup(req.user);
  return ok(res, data, 'Backup baru berhasil dibuat.', 201);
});

const downloadBackup = asyncHandler(async (req, res) => {
  const json = await settingsService.getBackupSnapshot(req.params.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="voucherhub-backup-${req.params.id}.json"`);
  res.send(json);
});

module.exports = {
  getSchool,
  updateSchool,
  listPrices,
  addPrice,
  removePrice,
  getSystem,
  updateSystem,
  updateAccount,
  listBackups,
  createBackup,
  downloadBackup,
};
