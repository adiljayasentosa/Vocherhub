// Centralized environment variable access.
// Every other file reads config through here instead of touching
// process.env directly, so the required set stays in one place.

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  session: {
    cookieName: process.env.SESSION_COOKIE_NAME || 'vh_session',
    // 5 days, in milliseconds — matches Firebase's max session cookie lifetime
    maxAgeMs: parseInt(process.env.SESSION_MAX_AGE_MS || String(5 * 24 * 60 * 60 * 1000), 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '8', 10),
  },

  dashboard: {
    lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '50', 10),
    recentTransactionsLimit: parseInt(process.env.RECENT_TRANSACTIONS_LIMIT || '5', 10),
  },

  // Distinct from dashboard.lowStockThreshold (fleet-wide) — this applies
  // per nominal, on the Voucher Inventory page's per-price-point table.
  inventory: {
    lowStockThresholdPerNominal: parseInt(process.env.LOW_STOCK_THRESHOLD_PER_NOMINAL || '100', 10),
  },

  // Firebase Admin SDK (server-side, secret) — required to boot the app.
  firebaseAdmin: {
    get projectId() { return required('FIREBASE_PROJECT_ID'); },
    get clientEmail() { return required('FIREBASE_CLIENT_EMAIL'); },
    get privateKey() { return required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'); },
  },

  // Firebase client config — NOT secret (safe to expose to the browser),
  // but still centralized here and read from env rather than hardcoded.
  firebaseClient: {
    apiKey: process.env.FIREBASE_CLIENT_API_KEY || '',
    authDomain: process.env.FIREBASE_CLIENT_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_CLIENT_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_CLIENT_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_CLIENT_APP_ID || '',
  },
};

module.exports = env;
