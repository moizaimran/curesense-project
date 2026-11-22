const asyncHandler = require("../utils/asyncHandler");
const statsService = require("../services/statsService");

// GET /api/doctors/:id/stats/treated?period=daily|weekly|monthly
const doctorPatientsTreated = asyncHandler(async (req, res) => {
  const doctorId = await statsService.assertCanViewDoctor(req.params.id, req.user);
  const result = await statsService.patientsTreated({ doctorId, period: req.query.period });
  res.json(result);
});

// GET /api/doctors/:id/stats/overview — case status donut + monthly comparison
const doctorCaseOverview = asyncHandler(async (req, res) => {
  const doctorId = await statsService.assertCanViewDoctor(req.params.id, req.user);
  res.json(await statsService.caseOverview({ doctorId }));
});

module.exports = { doctorPatientsTreated, doctorCaseOverview };
