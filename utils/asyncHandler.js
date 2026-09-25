const { AppError } = require("./errors");

// Wraps an async route handler. AppError instances from the service layer
// are converted to their HTTP status code + JSON message automatically.
// All other errors are forwarded to Express's centralized error middleware.
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  });

module.exports = asyncHandler;
