const authService = require('../services/authService');
const env = require('../config/env');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const cookieOptions = {
  maxAge: env.session.maxAgeMs,
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
};

const login = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  const { sessionCookie, user } = await authService.loginWithIdToken(idToken, { ip: req.ip });

  res.cookie(env.session.cookieName, sessionCookie, cookieOptions);
  return ok(res, { user }, 'Login berhasil.');
});

const logout = asyncHandler(async (req, res) => {
  const cookie = req.cookies?.[env.session.cookieName];
  await authService.logoutFromCookie(cookie);
  res.clearCookie(env.session.cookieName);
  return ok(res, null, 'Logout berhasil.');
});

const me = asyncHandler(async (req, res) => {
  return ok(res, { user: req.user });
});

module.exports = { login, logout, me };
