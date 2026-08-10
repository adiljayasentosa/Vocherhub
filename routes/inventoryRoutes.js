const express = require('express');
const { query } = require('express-validator');
const { requireAuth } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const inventoryController = require('../controllers/inventoryController');

const router = express.Router();

router.use(requireAuth);

router.get('/stock', inventoryController.getStock);

router.get(
  '/movements',
  [query('limit').optional().isInt({ min: 1, max: 100 }).toInt()],
  validate,
  inventoryController.getMovements,
);

module.exports = router;
