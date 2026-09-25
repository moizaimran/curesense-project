const asyncHandler   = require("../utils/asyncHandler");
const doctorService  = require("../services/doctorService");

const register = asyncHandler(async (req, res) => {
  const result = await doctorService.registerDoctor(req.body);
  res.status(201).json(result);
});

const searchDoctors = asyncHandler(async (req, res) => {
  const result = await doctorService.searchDoctors(req.query);
  res.json(result);
});

const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await doctorService.getMyProfile(req.user._id);
  res.json(profile);
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const profile = await doctorService.updateMyProfile(req.user._id, req.body);
  res.json(profile);
});

const getDoctorById = asyncHandler(async (req, res) => {
  const profile = await doctorService.getDoctorById(req.params.id);
  res.json(profile);
});

const getDoctorAvailableDates = asyncHandler(async (req, res) => {
  const result = await doctorService.getDoctorAvailableDates(req.params.id);
  res.json(result);
});

const getDoctorAvailability = asyncHandler(async (req, res) => {
  const result = await doctorService.getDoctorAvailability(req.params.id, req.query.date);
  res.json(result);
});

const updateMyAvailability = asyncHandler(async (req, res) => {
  const avail = await doctorService.updateMyAvailability(req.user._id, req.body);
  res.json(avail);
});

const adminListDoctors = asyncHandler(async (req, res) => {
  const result = await doctorService.adminListDoctors(req.query);
  res.json(result);
});

const adminVerifyDoctor = asyncHandler(async (req, res) => {
  const result = await doctorService.adminVerifyDoctor(req.params.id, req.body, req.user._id);
  res.json(result);
});

const getDashboardSummary = asyncHandler(async (req, res) => {
  const result = await doctorService.getDashboardSummary(req.params.id, req.user);
  res.json(result);
});

module.exports = {
  register,
  searchDoctors,
  getMyProfile,
  updateMyProfile,
  getDoctorById,
  getDoctorAvailableDates,
  getDoctorAvailability,
  updateMyAvailability,
  adminListDoctors,
  adminVerifyDoctor,
  getDashboardSummary,
};
