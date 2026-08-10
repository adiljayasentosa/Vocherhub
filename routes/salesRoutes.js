const express = require('express');
const { body, param, query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const salesController = require('../controllers/salesController');
const { NOMINALS, METHODS, BUYER_TYPES } = require('../services/salesService');

const router = express.Router();

// Same posture as Voucher module: both Admin and Operator sell/view day
// to day. Add requireRole('admin') to a specific route if that changes.
router.use(requireAuth);

router.get('/stats', salesController.getStats);
router.get('/chart', salesController.getChart);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim().isLength({ max: 100 }),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ],
  validate,
  salesController.list,
);

router.get(
  '/:id',
  [param('id').notEmpty()],
  validate,
  salesController.getById,
);

router.post(
  '/',
  [
    body('nominal').isInt({ min: 1 }).custom((v) => NOMINALS.includes(parseInt(v, 10))),
    body('pembeli').isIn(BUYER_TYPES),
    body('metode').isIn(METHODS),
  ],
  validate,
  salesController.sell,
);

module.exports = router;
