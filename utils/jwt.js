// =============================================================================
// Backend/utils/jwt.js — single source of truth for JWT signing
//
// Used by authController (patient register/login, admin creation) and
// doctorController (doctor register). Any change to secret, algorithm, or
// expiry only needs to happen here.
// =============================================================================
const jwt = require("jsonwebtoken");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

module.exports = { signToken };
