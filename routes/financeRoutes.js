const express = require('express');
const { body, query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const financeController = require('../controllers/financeController');

const router = express.Router();

// Same posture as the other operational modules: both Admin and Operator
// can record income/expense day to day. Add requireRole('admin') here if
// Finance should be restricted.
router.use(requireAuth);

router.get('/stats', financeController.getStats);
router.get('/cashflow', financeController.getCashFlow);
router.get('/monthly-summary', financeController.getMonthlySummary);
router.get(
  '/recent',
  [query('limit').optional().isInt({ min: 1, max: 20 }).toInt()],
  validate,
  financeController.getRecentActivity,
);
router.get('/income', financeController.listIncome);
router.get('/expense', financeController.listExpense);

const entryValidators = [
  body('tanggal').isISO8601(),
  body('deskripsi').optional().isString().trim().isLength({ max: 500 }),
  body('jumlah').isInt({ min: 1 }),
];

router.post(
  '/income',
  [...entryValidators, body('sumber').isString().trim().isLength({ min: 1, max: 200 })],
  validate,
  financeController.addIncome,
);

router.post(
  '/expense',
  [...entryValidators, body('kategori').isString().trim().isLength({ min: 1, max: 200 })],
  validate,
  financeController.addExpense,
);

module.exports = router;
