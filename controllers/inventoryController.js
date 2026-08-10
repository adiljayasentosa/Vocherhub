const inventoryService = require('../services/inventoryService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getStock = asyncHandler(async (req, res) => {
  const data = await inventoryService.getOverview();
  return ok(res, data);
});

const getMovements = asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const data = await inventoryService.getMovements(limit ? parseInt(limit, 10) : 20);
  return ok(res, data);
});

module.exports = { getStock, getMovements };
