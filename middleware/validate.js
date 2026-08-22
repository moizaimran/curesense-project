// =============================================================================
// Backend/middleware/validate.js
//
// Lightweight, reusable route-level guards. Apply them between protect/authorize
// and the controller so controllers never receive malformed input.
//
// validateObjectId(...params)
//   Returns 400 before any DB call if a named route param is not a valid
//   24-hex-character MongoDB ObjectId. Prevents Mongoose CastErrors from
//   reaching the controller, and stops CastError messages leaking to clients.
//   Usage: router.get("/:id", protect, validateObjectId("id"), handler)
//          router.get("/:patientId/reports", protect, validateObjectId("patientId"), handler)
//
// validateDateQuery(paramName)
//   Returns 400 if the named query parameter exists but is not a parseable date.
//   Usage: router.get("/:id/availability", protect, validateDateQuery("date"), handler)
// =============================================================================
const mongoose = require("mongoose");

const validateObjectId = (...paramNames) => (req, res, next) => {
  for (const param of paramNames) {
    if (!mongoose.Types.ObjectId.isValid(req.params[param])) {
      return res.status(400).json({ error: `Invalid ID: '${param}' is not a valid identifier` });
    }
  }
  next();
};

const validateDateQuery = (paramName = "date") => (req, res, next) => {
  const raw = req.query[paramName];
  if (raw !== undefined) {
    const d = new Date(raw);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: `Invalid date: '${paramName}' must be a valid date string (e.g. YYYY-MM-DD)` });
    }
  }
  next();
};

module.exports = { validateObjectId, validateDateQuery };
