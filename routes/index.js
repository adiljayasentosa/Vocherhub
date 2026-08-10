const express = require('express');
const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const configRoutes = require('./configRoutes');
const voucherRoutes = require('./voucherRoutes');
const salesRoutes = require('./salesRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const financeRoutes = require('./financeRoutes');
const attendanceRoutes = require('./attendanceRoutes');
const attendanceGeneratorRoutes = require('./attendanceGeneratorRoutes');
const reportRoutes = require('./reportRoutes');
const userRoutes = require('./userRoutes');
const settingsRoutes = require('./settingsRoutes');
const systemLogsRoutes = require('./systemLogsRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/config', configRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/sales', salesRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/finance', financeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/attendance-generator', attendanceGeneratorRoutes);
router.use('/reports', reportRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);
router.use('/logs', systemLogsRoutes);

module.exports = router;
