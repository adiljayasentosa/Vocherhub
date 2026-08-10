const { db, admin } = require('../config/firebase-admin');

/**
 * Records one entry in the stock movement history (Inventory module's
 * "Riwayat Pergerakan Stok"). Only movements that actually change the
 * *available* count for a nominal are meaningful here — callers pass 0
 * for anything that doesn't affect availability and this is a no-op,
 * so voucher creation at a non-Aktif status, or deleting an already
 * Nonaktif voucher, don't clutter the stock history.
 */
async function record({
  nominal, action, delta, actorName,
}) {
  if (!delta) return;
  await db.collection('stockMovements').add({
    nominal,
    action,
    delta,
    actorName: actorName || '-',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = { record };
