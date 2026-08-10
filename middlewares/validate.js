const { validationResult } = require('express-validator');
const { fail } = require('../utils/apiResponse');

/** Place after express-validator check(...) chains on a route. */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return fail(res, 422, 'Input tidak valid.', errors.array());
  }
  next();
}

module.exports = validate;
