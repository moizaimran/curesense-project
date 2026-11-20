const asyncHandler   = require("../utils/asyncHandler");
const doctorService  = require("../services/doctorService");
const { SPECIALTIES } = require("../constants/specialties");

const register = asyncHandler(async (req, res) => {
  const result = await doctorService.registerDoctor(req.body);
  res.status(201).json(result);
});

const searchDoctors = asyncHandler(async (req, res) => {
  const result = await doctorService.searchDoctors(req.query);
  res.json(result);
});

const getSpecialties = (req, res) => {
  res.json({ specialties: SPECIALTIES });
};

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

const { extractCnicFields } = require("../services/textractService");
const { verifyDoctor }      = require("../services/pmdcService");
const cloudinary            = require("../config/cloudinary");

const extractCnic = asyncHandler(async (req, res) => {
  const { cnic_image_base64 } = req.body;
  if (!cnic_image_base64) {
    return res.status(400).json({ error: "cnic_image_base64 is required" });
  }

  // Extract fields and upload to Cloudinary in parallel
  const [extracted, uploaded] = await Promise.all([
    extractCnicFields(cnic_image_base64),
    cloudinary.uploader.upload(`data:image/jpeg;base64,${cnic_image_base64}`, {
      folder:        "curesense/cnic",
      resource_type: "image",
    }),
  ]);

  res.json({ ...extracted, cnic_image_url: uploaded.secure_url });
});

// POST /api/doctors/verify-pmdc
// Body: { pmdc_number, name_from_cnic, father_name_from_cnic, typed_name, specialty }
// name_from_cnic / father_name_from_cnic come from /verify-cnic (Textract)
const verifyPmdc = asyncHandler(async (req, res) => {
  const { pmdc_number, name_from_cnic, father_name_from_cnic, typed_name, specialty } = req.body;
  if (!pmdc_number)
    return res.status(400).json({ error: "pmdc_number is required" });
  if (!name_from_cnic || !father_name_from_cnic)
    return res.status(400).json({ error: "name_from_cnic and father_name_from_cnic are required (run /verify-cnic first)" });

  const result = await verifyDoctor({
    pmdcNumber:        pmdc_number,
    nameFromCnic:      name_from_cnic,
    fatherNameFromCnic: father_name_from_cnic,
    typedName:         typed_name || "",
    specialty:         specialty  || "",
  });
  res.json(result);
});

const resendVerification = asyncHandler(async (req, res) => {
  await doctorService.resendDoctorVerificationEmail(req.body.email);
  res.json({ message: "Verification email sent" });
});

module.exports = {
  register,
  searchDoctors,
  getSpecialties,
  getMyProfile,
  updateMyProfile,
  getDoctorById,
  getDoctorAvailableDates,
  getDoctorAvailability,
  updateMyAvailability,
  adminListDoctors,
  adminVerifyDoctor,
  getDashboardSummary,
  extractCnic,
  verifyPmdc,
  resendVerification,
};
