const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

// Both Admin and Operator see the same dashboard in Phase 2 — no role
// restriction here. Add requireRole('admin') on future admin-only routes.
router.get('/summary', requireAuth, dashboardController.getSummary);

module.exports = router;
