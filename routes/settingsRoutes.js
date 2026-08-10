const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');
const validate = require('../middlewares/validate');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

router.use(requireAuth);

// "Akun Saya" is self-service -- any authenticated user manages their
// own profile, unlike the rest of Settings which is school-wide config.
router.put(
  '/account',
  [
    body('nama').isString().trim().isLength({ min: 1, max: 150 }),
    body('password').optional({ checkFalsy: true }).isLength({ min: 8 }),
    body('confirmPassword').optional({ checkFalsy: true }).isLength({ min: 8 }),
  ],
  validate,
  settingsController.updateAccount,
);

// Everything else here is school-wide configuration -- admin-only.
router.use(requireRole('admin'));

router.get('/school', settingsController.getSchool);
router.put(
  '/school',
  [
    body('nama').isString().trim().isLength({ min: 1, max: 200 }),
    body('npsn').optional().isString().trim().isLength({ max: 50 }),
    body('alamat').optional().isString().trim().isLength({ max: 300 }),
    body('telepon').optional().isString().trim().isLength({ max: 50 }),
    body('email').optional({ checkFalsy: true }).isEmail(),
  ],
  validate,
  settingsController.updateSchool,
);

router.get('/prices', settingsController.listPrices);
router.post('/prices', [body('nominal').isInt({ min: 1 })], validate, settingsController.addPrice);
router.delete('/prices/:id', [param('id').notEmpty()], validate, settingsController.removePrice);

router.get('/system', settingsController.getSystem);
router.put(
  '/system',
  [
    body('lowStockThreshold').isInt({ min: 0 }),
    body('recentTransactionsLimit').isInt({ min: 1 }),
    body('notifikasiEmail').optional().isBoolean(),
    body('modePemeliharaan').optional().isBoolean(),
  ],
  validate,
  settingsController.updateSystem,
);

router.get('/backups', settingsController.listBackups);
router.post('/backups', settingsController.createBackup);
router.get('/backups/:id/download', [param('id').notEmpty()], validate, settingsController.downloadBackup);

module.exports = router;
