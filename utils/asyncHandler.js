// Wraps an async route handler and forwards any thrown error to Express's
// centralized error middleware (defined in server.js), eliminating
// repetitive try/catch blocks across controllers.
const asyncHandler = fn => (req, res, next) =>
  fn(req, res, next).catch(next);

module.exports = asyncHandler;
