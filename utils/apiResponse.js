// Small helpers so every endpoint returns the same JSON envelope shape.

function ok(res, data, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function fail(res, statusCode, message, errors = undefined) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}

module.exports = { ok, fail };
