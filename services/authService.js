const { auth, db, admin } = require('../config/firebase-admin');
const env = require('../config/env');
const logService = require('./logService');

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Verifies a Firebase ID token from the client, requires a matching
 * users/{uid} Firestore doc to already exist (an Admin provisions this —
 * Firebase Auth alone does not grant app access), and returns a session
 * cookie for the caller to set as an httpOnly cookie.
 */
async function loginWithIdToken(idToken, meta = {}) {
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch (err) {
    await logService.log('login_failed', { message: 'ID token tidak valid', ip: meta.ip });
    throw httpError(401, 'Sesi login tidak valid. Silakan login ulang.');
  }

  const userRef = db.collection('users').doc(decoded.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    await logService.log('login_failed', {
      uid: decoded.uid, email: decoded.email, ip: meta.ip,
      message: 'Akun belum terdaftar di Firestore (users/{uid} belum dibuat Admin)',
    });
    throw httpError(403, 'Akun belum terdaftar di sistem. Hubungi Admin.');
  }

  const userData = userSnap.data();
  if (userData.active === false) {
    await logService.log('login_failed', {
      uid: decoded.uid, email: decoded.email, ip: meta.ip, message: 'Akun dinonaktifkan',
    });
    throw httpError(403, 'Akun dinonaktifkan. Hubungi Admin.');
  }

  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: env.session.maxAgeMs });

  await userRef.update({ lastLoginAt: admin.firestore.FieldValue.serverTimestamp() });
  await logService.log('login_success', {
    uid: decoded.uid, email: userData.email, ip: meta.ip, message: 'Login berhasil',
  });

  return {
    sessionCookie,
    user: {
      uid: decoded.uid,
      email: userData.email,
      name: userData.name || '',
      role: userData.role || 'operator',
    },
  };
}

/** Best-effort logout: revokes refresh tokens if the cookie is still valid. */
async function logoutFromCookie(cookie) {
  if (!cookie) return;
  try {
    const decoded = await auth.verifySessionCookie(cookie);
    await auth.revokeRefreshTokens(decoded.uid);
    await logService.log('logout', { uid: decoded.uid, message: 'Logout' });
  } catch (err) {
    // Cookie already invalid/expired — nothing to revoke.
  }
}

module.exports = { loginWithIdToken, logoutFromCookie };
