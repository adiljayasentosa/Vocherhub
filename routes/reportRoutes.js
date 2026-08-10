const express = require('express');
const { param, query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const reportController = require('../controllers/reportController');
const { REPORT_KEYS } = require('../services/reportService');

const router = express.Router();

router.use(requireAuth);

const paramsValidators = [
  param('key').isIn(REPORT_KEYS),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
];

router.get('/:key', paramsValidators, validate, reportController.getReport);
router.get('/:key/export/pdf', paramsValidators, validate, reportController.exportPdf);
router.get('/:key/export/excel', paramsValidators, validate, reportController.exportExcel);

module.exports = router;
