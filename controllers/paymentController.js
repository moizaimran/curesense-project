const asyncHandler   = require("../utils/asyncHandler");
const paymentService = require("../services/paymentService");

// POST /api/appointments/:id/payment/card   (patient, sandbox gateway)
const payByCard = asyncHandler(async (req, res) => {
  res.json(await paymentService.payByCard(req.params.id, req.user, req.body));
});

// POST /api/appointments/:id/payment/wallet (patient, EasyPaisa / JazzCash TID)
const payByWallet = asyncHandler(async (req, res) => {
  res.json(await paymentService.payByWallet(req.params.id, req.user, req.body));
});

// PATCH /api/appointments/admin/:id/payment (admin: reject TID / mark refunded)
const adminPaymentDecision = asyncHandler(async (req, res) => {
  res.json(await paymentService.adminPaymentDecision(req.params.id, req.body, req.user._id));
});

// GET /api/payments/accounts (any signed-in user)
const getPaymentAccounts = asyncHandler(async (req, res) => {
  res.json(await paymentService.getPaymentAccounts());
});

module.exports = { payByCard, payByWallet, adminPaymentDecision, getPaymentAccounts };
