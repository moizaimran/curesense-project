const asyncHandler  = require("../utils/asyncHandler");
const reviewService = require("../services/reviewService");

const submitReview = asyncHandler(async (req, res) => {
  const result = await reviewService.submitReview(req.params.id, req.user, req.body);
  res.json(result);
});

const getAppointmentReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getAppointmentReviews(req.params.id, req.user);
  res.json(result);
});

const getDoctorReviews = asyncHandler(async (req, res) => {
  const result = await reviewService.getDoctorReviews(req.params.id, req.query);
  res.json(result);
});

module.exports = { submitReview, getAppointmentReviews, getDoctorReviews };
