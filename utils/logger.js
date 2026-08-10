// Minimal console logger. Kept deliberately small — this is not a
// replacement for the systemLogs Firestore collection (see
// services/logService.js), just server-side console output for
// local dev / process logs.

function timestamp() {
  return new Date().toISOString();
}

module.exports = {
  info: (...args) => console.log(`[${timestamp()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${timestamp()}] [ERROR]`, ...args),
};
