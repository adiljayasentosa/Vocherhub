const env = require('../config/env');
const { ok } = require('../utils/apiResponse');

// These values identify the Firebase project to the client SDK and are
// not secret (Firestore/Auth security rules do the actual protecting) —
// but they're still centralized in .env instead of hardcoded in the HTML.
function getFirebaseClientConfig(req, res) {
  return ok(res, env.firebaseClient);
}

module.exports = { getFirebaseClientConfig };
