const { db, admin } = require('../config/firebase-admin');

/**
 * Writes an entry to the systemLogs collection. Best-effort: a logging
 * failure must never break the request it's attached to, so errors are
 * swallowed (and reported to the console) rather than thrown.
 */
async function log(type, { uid = null, email = null, message = '', ip = null } = {}) {
  try {
    await db.collection('systemLogs').add({
      type,
      uid,
      email,
      message,
      ip,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[logService] failed to write systemLogs entry:', err.message);
  }
}

module.exports = { log };
