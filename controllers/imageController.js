const asyncHandler   = require("../utils/asyncHandler");
const imageService   = require("../services/imageService");

const uploadImage = asyncHandler(async (req, res) => {
  const result = await imageService.uploadImage(req.body, req.user);
  res.status(202).json(result);
});

const uploadForSession = asyncHandler(async (req, res) => {
  const result = await imageService.uploadForSession(req.body, req.user);
  res.status(202).json(result);
});

const listImages = asyncHandler(async (req, res) => {
  const records = await imageService.listImages(req.user._id);
  res.json(records);
});

const listPatientImages = asyncHandler(async (req, res) => {
  const records = await imageService.listPatientImages(req.params.patientId, req.user);
  res.json(records);
});

const getImageStatus = asyncHandler(async (req, res) => {
  const record = await imageService.getImageStatus(req.params.id, req.user._id);
  res.json(record);
});

const deleteImage = asyncHandler(async (req, res) => {
  const result = await imageService.deleteImage(req.params.id, req.user._id);
  res.json(result);
});

module.exports = { uploadImage, uploadForSession, listImages, listPatientImages, getImageStatus, deleteImage };
