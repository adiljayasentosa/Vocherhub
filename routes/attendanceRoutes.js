const express = require('express');
const { body, param } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const attendanceController = require('../controllers/attendanceController');
const { KELAS, STATUSES, DAYS } = require('../services/attendanceService');

const router = express.Router();

router.use(requireAuth);

router.get('/recap', attendanceController.getMonthlyRecap);

router.get(
  '/:day',
  [param('day').isIn(DAYS)],
  validate,
  attendanceController.getSession,
);

router.post(
  '/:day',
  [
    param('day').isIn(DAYS),
    body('nama').isString().trim().isLength({ min: 1, max: 150 }),
    body('kelas').isIn(KELAS),
    body('status').isIn(STATUSES),
    body('keterangan').optional().isString().trim().isLength({ max: 300 }),
  ],
  validate,
  attendanceController.addAttendance,
);

router.patch(
  '/records/:id',
  [
    param('id').notEmpty(),
    body('status').isIn(STATUSES),
    body('keterangan').optional().isString().trim().isLength({ max: 300 }),
  ],
  validate,
  attendanceController.updateStatus,
);

module.exports = router;
