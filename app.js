const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const logger = require('./utils/logger');
const { helmetMiddleware, apiLimiter } = require('./middlewares/security');
const { fail } = require('./utils/apiResponse');
const routes = require('./routes');

const app = express();

app.set('trust proxy', 1); // needed for req.ip to be correct behind a reverse proxy

app.use(helmetMiddleware);
app.use(express.json());
app.use(cookieParser());

app.use('/api', apiLimiter, routes);

// Phase 1 frontend, served as static files — same origin as the API,
// so no CORS setup is needed.
app.use(express.static(path.join(__dirname, 'public')));

// Any /api path that didn't match a route above -> JSON 404
// (must come after the routes mount, before the error handler).
app.use('/api', (req, res) => fail(res, 404, 'Endpoint tidak ditemukan.'));

// Central error handler — catches anything thrown/forwarded via asyncHandler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(err.message, env.nodeEnv === 'development' ? err.stack : '');
  const statusCode = err.statusCode || 500;
  const message = statusCode < 500 ? err.message : 'Terjadi kesalahan pada server.';
  return fail(res, statusCode, message);
});

module.exports = app;
