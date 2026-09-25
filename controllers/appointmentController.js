const asyncHandler         = require("../utils/asyncHandler");
const appointmentService   = require("../services/appointmentService");

const createAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.createAppointment(req.body, req.user);
  res.status(201).json(result);
});

const getAppointmentById = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.getAppointmentById(req.params.id, req.user);
  res.json(appointment);
});

const getMyAppointments = asyncHandler(async (req, res) => {
  const appointments = await appointmentService.getMyAppointments(req.user, req.query);
  res.json(appointments);
});

const getDoctorAppointments = asyncHandler(async (req, res) => {
  const appointments = await appointmentService.getDoctorAppointments(req.user._id, req.query);
  res.json(appointments);
});

const adminGetAppointments = asyncHandler(async (req, res) => {
  const result = await appointmentService.adminGetAppointments(req.query);
  res.json(result);
});

const adminReviewAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.adminReviewAppointment(req.params.id, req.body, req.user._id);
  res.json(result);
});

const getPatientAppointmentHistory = asyncHandler(async (req, res) => {
  const appointments = await appointmentService.getPatientAppointmentHistory(req.params.id, req.query, req.user);
  res.json(appointments);
});

const addQuery = asyncHandler(async (req, res) => {
  const result = await appointmentService.addQuery(req.params.id, req.body, req.user);
  res.status(201).json(result);
});

const markQueriesRead = asyncHandler(async (req, res) => {
  const result = await appointmentService.markQueriesRead(req.params.id, req.user._id);
  res.json(result);
});

const submitFeedback = asyncHandler(async (req, res) => {
  const result = await appointmentService.submitFeedback(req.params.id, req.body, req.user._id);
  res.json(result);
});

const uploadTestResult = asyncHandler(async (req, res) => {
  const result = await appointmentService.uploadTestResult(req.params.id, req.body, req.user);
  res.status(201).json(result);
});

const markTestUploadsRead = asyncHandler(async (req, res) => {
  const result = await appointmentService.markTestUploadsRead(req.params.id, req.user._id);
  res.json(result);
});

const completeAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.completeAppointment(req.params.id, req.user._id);
  res.json(result);
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.cancelAppointment(req.params.id, req.user);
  res.json(result);
});

module.exports = {
  createAppointment,
  getMyAppointments,
  getAppointmentById,
  getDoctorAppointments,
  adminGetAppointments,
  adminReviewAppointment,
  getPatientAppointmentHistory,
  addQuery,
  markQueriesRead,
  submitFeedback,
  uploadTestResult,
  markTestUploadsRead,
  completeAppointment,
  cancelAppointment,
};
