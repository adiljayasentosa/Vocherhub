const express = require('express');
const { query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');
const validate = require('../middlewares/validate');
const systemLogsController = require('../controllers/systemLogsController');
const { SEVERITIES } = require('../services/systemLogsService');

const router = express.Router();

// Admin-only: IP addresses and login-failure details are sensitive,
// same posture as User Management.
router.use(requireAuth, requireRole('admin'));

router.get('/filter-options', systemLogsController.getFilterOptions);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim().isLength({ max: 100 }),
    query('severity').optional().isIn(['Semua Tipe', ...SEVERITIES]),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
  ],
  validate,
  systemLogsController.list,
);

module.exports = router;
