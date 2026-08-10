// Wraps an async (req, res, next) handler so a rejected promise is
// forwarded to next(err) instead of crashing the process unhandled.

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
