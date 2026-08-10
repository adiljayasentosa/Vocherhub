// Vercel serverless entry point. Vercel calls this file's export as the
// request handler for every path matched in vercel.json — it does NOT
// run server.js/app.listen() (that stays for local `npm run dev` only).
// app.js already does `module.exports = app` with no listen() call, so
// this file just re-exports it as-is.
module.exports = require('../app');
