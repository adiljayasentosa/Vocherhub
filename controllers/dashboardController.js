const dashboardService = require('../services/dashboardService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getSummary = asyncHandler(async (req, res) => {
  const data = await dashboardService.getSummary();
  return ok(res, data);
});

module.exports = { getSummary };
