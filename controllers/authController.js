const asyncHandler = require("../utils/asyncHandler");
const authService  = require("../services/authService");

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerPatient(req.body);
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.json(result);
});

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

module.exports = { register, login, createStaff, assignPatient, getMe, updateMe, listStaff, getSettings, updateSettings, registerPushToken };
