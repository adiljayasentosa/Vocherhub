const { auth, db } = require('../config/firebase-admin');
const env = require('../config/env');
const { fail } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Verifies the Firebase session cookie set at login, loads the user's
 * profile + role from Firestore, and attaches it as req.user.
 * Responds 401 if there's no valid session.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const cookie = req.cookies?.[env.session.cookieName];
  if (!cookie) {
    return fail(res, 401, 'Belum login.');
  }

  let decoded;
  try {
    decoded = await auth.verifySessionCookie(cookie, true /* checkRevoked */);
  } catch (err) {
    res.clearCookie(env.session.cookieName);
    return fail(res, 401, 'Sesi tidak valid atau telah berakhir.');
  }

  const userDoc = await db.collection('users').doc(decoded.uid).get();
  if (!userDoc.exists) {
    return fail(res, 401, 'Akun tidak ditemukan.');
  }

  const userData = userDoc.data();
  if (userData.active === false) {
    return fail(res, 403, 'Akun dinonaktifkan. Hubungi Admin.');
  }

  req.user = {
    uid: decoded.uid,
    email: userData.email || decoded.email,
    name: userData.name || '',
    role: userData.role || 'operator',
  };

  next();
});

module.exports = { requireAuth };
