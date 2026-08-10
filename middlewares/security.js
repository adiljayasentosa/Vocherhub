const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// helmet()'s default Content-Security-Policy is script-src 'self' only,
// which silently blocks every external script this app's frontend
// actually depends on at runtime: Tailwind's CDN build, Lucide icons,
// Chart.js (dashboard only), and the Firebase client SDK modules
// (public/js/login.js imports these directly from gstatic.com). Left at
// the default, the browser blocks all of them with no server-side error
// anywhere — it just silently breaks every page. connect-src is opened
// up for Firebase Auth's own REST calls (identitytoolkit/securetoken),
// which the client SDK makes directly from the browser during sign-in.
// style-src needs 'unsafe-inline' because the Tailwind CDN script
// injects its compiled styles into an inline <style> tag at runtime —
// there's no static stylesheet to point CSP at instead.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://cdn.tailwindcss.com',
        'https://unpkg.com',
        'https://cdn.jsdelivr.net',
        'https://www.gstatic.com',
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
      ],
    },
  },
});

// General limiter for all /api routes.
const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan, coba lagi nanti.' },
});

// Stricter limiter just for the login endpoint, to slow down brute force.
const loginLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login, coba lagi nanti.' },
});

module.exports = { helmetMiddleware, apiLimiter, loginLimiter };
