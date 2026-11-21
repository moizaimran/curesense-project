const asyncHandler = require("../utils/asyncHandler");
const statsService = require("../services/statsService");

// GET /api/doctors/:id/stats/treated?period=daily|weekly|monthly
const doctorPatientsTreated = asyncHandler(async (req, res) => {
  const doctorId = await statsService.assertCanViewDoctor(req.params.id, req.user);
  const result = await statsService.patientsTreated({ doctorId, period: req.query.period });
  res.json(result);
});

module.exports = { doctorPatientsTreated };
