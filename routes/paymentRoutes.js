// =============================================================================
// Backend/routes/paymentRoutes.js — mounted at /api/payments
// (per-appointment payment actions live under /api/appointments/:id/payment)
// =============================================================================
const express = require("express");
const router  = express.Router();
const { getPaymentAccounts } = require("../controllers/paymentController");
const { protect }            = require("../middleware/auth");

// Enabled methods + admin wallet accounts, shown on the checkout screen
router.get("/accounts", protect, getPaymentAccounts);

module.exports = router;
