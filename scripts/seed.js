// One-time sample data seeder for Firestore.
//
// This does NOT create Firebase Auth users or users/{uid} docs — those
// need a real auth account behind them. See README.md "First admin user"
// for how to create yours. This script only fills `vouchers` and `sales`
// so the dashboard (Phase 2) has real numbers to display instead of zeros.
//
// Run with: npm run seed

const { db, admin } = require('../config/firebase-admin');

const NOMINALS = [3000, 5000, 10000];
const OPERATORS = ['Budi', 'Siti', 'Andi'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedVouchers(count = 200) {
  const batch = db.batch();
  const col = db.collection('vouchers');
  for (let i = 0; i < count; i++) {
    const ref = col.doc();
    const nominal = randomFrom(NOMINALS);
    const roll = Math.random();
    const status = roll < 0.7 ? 'available' : roll < 0.95 ? 'sold' : 'expired';
    batch.set(ref, {
      code: `VCH-SEED-${String(i + 1).padStart(4, '0')}`,
      nominal,
      status,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      soldAt: status === 'sold' ? admin.firestore.FieldValue.serverTimestamp() : null,
    });
  }
  await batch.commit();
  console.log(`Seeded ${count} vouchers.`);
}

async function seedSales(count = 40) {
  const batch = db.batch();
  const col = db.collection('sales');
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const ref = col.doc();
    const nominal = randomFrom(NOMINALS);
    const daysAgo = Math.floor(Math.random() * 7);
    const msIntoDay = Math.floor(Math.random() * 12 * 60 * 60 * 1000);
    const createdAt = admin.firestore.Timestamp.fromMillis(now - daysAgo * 24 * 60 * 60 * 1000 - msIntoDay);
    batch.set(ref, {
      voucherCode: `VCH-SEED-${String(i + 1).padStart(4, '0')}`,
      nominal,
      operatorId: 'seed-operator',
      operatorName: randomFrom(OPERATORS),
      method: 'Tunai',
      status: 'Selesai',
      createdAt,
    });
  }
  await batch.commit();
  console.log(`Seeded ${count} sales.`);
}

async function main() {
  await seedVouchers();
  await seedSales();
  console.log('\nDone. Reminder: Firebase Auth users + their matching users/{uid}');
  console.log('Firestore docs are NOT created by this script — see README.md.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
