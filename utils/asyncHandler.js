const { AppError } = require("./errors");

// Wraps an async route handler. AppError instances from the service layer
// are converted to their HTTP status code + JSON message automatically.
// All other errors are forwarded to Express's centralized error middleware.
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err => {
    if (err instanceof AppError) {
      const body = { error: err.message };
      if (err.unverified) { body.unverified = true; body.email = err.email; }
      return res.status(err.statusCode).json(body);
    }
    next(err);
  });

module.exports = asyncHandler;
