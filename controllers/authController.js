const asyncHandler = require("../utils/asyncHandler");
const authService  = require("../services/authService");

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerPatient(req.body);
  res.status(201).json(result);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.body.email);
  res.json(result);
});

const resendOTP = asyncHandler(async (req, res) => {
  const result = await authService.resendOTP(req.body.email, req.body.type);
  res.json(result);
});

// login removed — clients authenticate via Firebase Client SDK and send Firebase ID tokens

const googleAuth = asyncHandler(async (req, res) => {
  const result = await authService.googleAuth(req.body.id_token);
  res.json(result);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);
  res.json(result);
});

// verifyResetOTP and resetPassword removed — Firebase handles password reset end-to-end

const createStaff = asyncHandler(async (req, res) => {
  const result = await authService.createStaffUser(req.body);
  res.status(201).json(result);
});

const assignPatient = asyncHandler(async (req, res) => {
  const result = await authService.assignPatientToDoctor(req.body);
  res.json(result);
});

const getMe = asyncHandler(async (req, res) => {
  res.json(req.user);
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateUserName(req.user._id, req.body.name);
  res.json(user);
});

const listStaff = asyncHandler(async (req, res) => {
  const result = await authService.listAdminUsers();
  res.json(result);
});

const getSettings = asyncHandler(async (req, res) => {
  const settings = await authService.getSettings();
  res.json(settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await authService.updateSettings(req.body);
  res.json(settings);
});

const registerPushToken = asyncHandler(async (req, res) => {
  const result = await authService.registerPushToken(req.user._id, req.body.expo_push_token);
  res.json(result);
});

module.exports = {
  register, verifyEmail, resendOTP,
  googleAuth,
  forgotPassword,
  createStaff, assignPatient,
  getMe, updateMe,
  listStaff, getSettings, updateSettings,
  registerPushToken,
};
