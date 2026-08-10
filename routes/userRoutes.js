const express = require('express');
const { body, param, query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const { requireRole } = require('../middlewares/rbac');
const validate = require('../middlewares/validate');
const userController = require('../controllers/userController');
const { ROLES, STATUSES } = require('../services/userService');

const router = express.Router();

// Unlike the operational modules (Voucher/Sales/Finance/Attendance),
// managing staff accounts and roles is admin-only -- middlewares/rbac.js
// was pre-built in Phase 2 with a comment anticipating exactly this.
router.use(requireAuth, requireRole('admin'));

router.get('/stats', userController.getStats);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('role').optional().isIn(['Semua Role', ...ROLES]),
    query('search').optional().isString().trim().isLength({ max: 100 }),
  ],
  validate,
  userController.list,
);

router.get('/:id', [param('id').notEmpty()], validate, userController.getById);

const userValidators = [
  body('nama').isString().trim().isLength({ min: 1, max: 150 }),
  body('email').isEmail(),
  body('role').isIn(ROLES),
];

router.post(
  '/',
  [...userValidators, body('status').optional().isIn(STATUSES)],
  validate,
  userController.create,
);

router.patch(
  '/:id',
  [param('id').notEmpty(), ...userValidators, body('status').isIn(STATUSES)],
  validate,
  userController.update,
);

router.delete('/:id', [param('id').notEmpty()], validate, userController.remove);

module.exports = router;
