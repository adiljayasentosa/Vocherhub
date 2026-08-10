const express = require('express');
const { body, query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const generatorController = require('../controllers/attendanceGeneratorController');
const { JENIS, KELAS_OPTIONS, MAX_WEEKS } = require('../services/attendanceGeneratorService');

const router = express.Router();

router.use(requireAuth);

router.get('/weeks', generatorController.getWeeks);
router.get('/last', generatorController.getLast);

const genQueryValidators = [
  query('minggu').isInt({ min: 1, max: MAX_WEEKS }),
  query('jenis').isIn(JENIS),
  query('kelas').isIn(KELAS_OPTIONS),
];

router.get('/preview', genQueryValidators, validate, generatorController.getPreview);
router.get('/export/pdf', genQueryValidators, validate, generatorController.exportPdf);
router.get('/export/excel', genQueryValidators, validate, generatorController.exportExcel);

router.post(
  '/generate',
  [
    body('minggu').isInt({ min: 1, max: MAX_WEEKS }),
    body('jenis').isIn(JENIS),
    body('kelas').isIn(KELAS_OPTIONS),
  ],
  validate,
  generatorController.generate,
);

module.exports = router;
