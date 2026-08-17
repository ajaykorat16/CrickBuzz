const { validationResult } = require('express-validator');
const { ErrorHandler } = require('./error.middleware');

/** Place immediately after express-validator rule chains in routes. */
function validate(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const details = result.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));

  return next(new ErrorHandler('Validation failed', 422, details));
}

module.exports = validate;
