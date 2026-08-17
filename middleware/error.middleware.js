/**
 * Central error helpers:
 * - ErrorHandler — operational errors with HTTP status
 * - TryCatch — wraps async controllers so rejections reach errorMiddleware
 * - errorMiddleware / notFoundHandler — Express error pipeline
 */

class ErrorHandler extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

const TryCatch = (passedFunc) => async (req, res, next) => {
  try {
    await passedFunc(req, res, next);
  } catch (error) {
    if (error instanceof ErrorHandler) {
      return next(error);
    }

    return next(new ErrorHandler(error.message || 'Internal Server Error', 500));
  }
};

const notFoundHandler = (req, res, next) => {
  next(new ErrorHandler(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

/** Final Express error handler — keep registered after all routes. */
const errorMiddleware = (err, req, res, next) => {
  try {
    err.message ||= 'Internal Server Error';
    err.statusCode ||= 500;

    const payload = {
      error: true,
      message: err.message,
    };

    if (err.details) {
      payload.errors = err.details;
    }

    if (process.env.NODE_ENV !== 'production' && !err.isOperational) {
      payload.stack = err.stack;
    }

    if (!err.isOperational) {
      console.error(err);
    }

    return res.status(err.statusCode).json(payload);
  } catch (error) {
    return res.status(err.statusCode || 500).json({
      error: true,
      message: err.message || 'Internal Server Error',
    });
  }
};

module.exports = {
  ErrorHandler,
  TryCatch,
  errorMiddleware,
  notFoundHandler,
};
