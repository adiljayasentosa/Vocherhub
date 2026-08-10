const express = require('express');
const { body, param, query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const voucherController = require('../controllers/voucherController');
const { DISPLAY_STATUSES } = require('../services/voucherService');

const router = express.Router();

// Voucher management is used day-to-day by both roles (same pattern as
// the Phase 2 dashboard route) — no requireRole restriction here. If the
// school later wants create/delete limited to Admin only, add
// requireRole('admin') to those specific routes.
router.use(requireAuth);

router.get(
  '/stats',
  voucherController.getStats,
);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['Semua Status', ...DISPLAY_STATUSES]),
    query('search').optional().isString().trim().isLength({ max: 100 }),
  ],
  validate,
  voucherController.list,
);

router.get(
  '/:id',
  [param('id').notEmpty()],
  validate,
  voucherController.getById,
);

router.post(
  '/',
  [
    body('nominal').isInt({ min: 1 }),
    body('jumlah').isInt({ min: 1, max: 500 }),
    body('status').optional().isIn(DISPLAY_STATUSES),
  ],
  validate,
  voucherController.create,
);

router.patch(
  '/:id',
  [
    param('id').notEmpty(),
    body('nominal').isInt({ min: 1 }),
    body('status').isIn(DISPLAY_STATUSES),
  ],
  validate,
  voucherController.update,
);

router.delete(
  '/:id',
  [param('id').notEmpty()],
  validate,
  voucherController.remove,
);

module.exports = router;
