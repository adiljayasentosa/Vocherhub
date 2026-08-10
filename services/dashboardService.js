const { db } = require('../config/firebase-admin');
const salesService = require('./salesService');
const settingsService = require('./settingsService');
const { startOfTodayWIB } = require('../utils/dateRange');

async function getVoucherCounts() {
  const [availableSnap, activeSnap] = await Promise.all([
    db.collection('vouchers').where('status', '==', 'available').count().get(),
    db.collection('vouchers').where('status', '!=', 'expired').count().get(),
  ]);
  return {
    stock: availableSnap.data().count,
    active: activeSnap.data().count,
  };
}

async function getNotifications(voucherStock) {
  const notifications = [];

  const lowStockThreshold = await settingsService.getEffectiveLowStockThreshold();
  if (voucherStock < lowStockThreshold) {
    notifications.push({
      type: 'warning',
      message: `Stok voucher tersisa ${voucherStock} lembar, di bawah ambang batas.`,
      time: 'Baru saja',
    });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const failedLoginsSnap = await db.collection('systemLogs')
    .where('type', '==', 'login_failed')
    .where('createdAt', '>=', dayAgo)
    .count().get();

  const failedCount = failedLoginsSnap.data().count;
  if (failedCount >= 3) {
    notifications.push({
      type: 'warning',
      message: `Terdapat ${failedCount} percobaan login gagal dalam 24 jam terakhir.`,
      time: '24 jam terakhir',
    });
  }

  return notifications;
}

async function getEffectiveRecentTransactionsLimit() {
  const settings = await settingsService.getSystemSettings();
  return settings.recentTransactionsLimit;
}

async function getSummary() {
  const [todaySales, voucherCounts, revenueChart, recentTransactions] = await Promise.all([
    salesService.getSalesInRange(startOfTodayWIB()),
    getVoucherCounts(),
    salesService.getRevenueChart(7),
    getEffectiveRecentTransactionsLimit().then((limit) => salesService.getRecentTransactions(limit)),
  ]);

  const revenueToday = todaySales.reduce((sum, s) => sum + (s.nominal || 0), 0);
  const notifications = await getNotifications(voucherCounts.stock);

  return {
    stats: {
      pendapatanHariIni: { value: revenueToday },
      penjualanHariIni: { value: todaySales.length, unit: 'Transaksi' },
      stokVoucher: { value: voucherCounts.stock, unit: 'Voucher' },
      voucherAktif: { value: voucherCounts.active, unit: 'Voucher' },
    },
    revenueChart,
    recentTransactions,
    notifications,
  };
}

module.exports = { getSummary };
