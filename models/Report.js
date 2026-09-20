// =============================================================================
// Backend/models/Report.js
// =============================================================================
const mongoose = require("mongoose");

const EntitySchema = new mongoose.Schema(
  {
    category:   { type: String, required: true },
    keyword:    { type: String, required: true },
    relates_to: { type: String, default: "" },
  },
  { _id: false }
);

const DiseaseRankSchema = new mongoose.Schema(
  {
    disease:    { type: String, required: true },
    confidence: { type: Number, required: true },
  },
  { _id: false }
);

const RetrievedChunkSchema = new mongoose.Schema(
  {
    source: { type: String, default: "" },
    title:  { type: String, default: "" },
    text:   { type: String, default: "" },
    score:  { type: Number, default: 0  },
  },
  { _id: false }
);

const MedicationFlagSchema = new mongoose.Schema(
  {
    drug:     { type: String, default: "" },
    flag:     { type: String, default: "" },
    citation: { type: String, default: "" },
  },
  { _id: false }
);

// Interpreted diagnosis — LLM-evaluated, shared by doctor and patient dashboards
const InterpretedDiagnosisSchema = new mongoose.Schema(
  {
    disease:        { type: String, default: "" },
    icdCode:        { type: String, default: "" },
    plausibility:   { type: String, enum: ["likely", "possible", "unlikely"], default: "possible" },
    clinicalReason: { type: String, default: "" },
    patientNote:    { type: String, default: "" },
  },
  { _id: false }
);

const SelfCareGuidanceItemSchema = new mongoose.Schema(
  {
    point: { type: String, default: "" },
  },
  { _id: false }
);

const DiagnosisNoteSchema = new mongoose.Schema(
  {
    disease: { type: String, default: "" },
    note:    { type: String, default: "" },
  },
  { _id: false }
);

const MedicationNoteSchema = new mongoose.Schema(
  {
    drug: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const ReportSchema = new mongoose.Schema(
  {
    session_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Session",
      required: true,
      unique:   true,
    },
    patient_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Patient",
      required: true,
    },
    generated_at:     { type: Date,   default: Date.now },
    rag_query:        { type: String, default: "" },
    diagnostic_query: { type: String, default: "" },
    entities:         { type: [EntitySchema],         default: [] },
    disease_ranking:  { type: [DiseaseRankSchema],    default: [] },
    retrieved_chunks: { type: [RetrievedChunkSchema], default: [] },
    openfda_results:  { type: mongoose.Schema.Types.Mixed, default: {} },

    doctor_report: {
      patientComplaintSummary: { type: String,                 default: "" },
      ragSummary:              { type: String,                 default: "" },
      medicationFlags:         { type: [MedicationFlagSchema], default: [] },
    },

    patient_summary: {
      patientComplaintSummary: { type: String,                        default: "" },
      referralSpecialty:       { type: String,                        default: "" },
      selfCareGuidance:        { type: [SelfCareGuidanceItemSchema],  default: [] },
      researchSummary:         { type: String,                        default: "" },
      diagnosisNotes:          { type: [DiagnosisNoteSchema],         default: [] },
      medicationNotes:         { type: [MedicationNoteSchema],        default: [] },
    },

    // LLM-evaluated disease candidates — single source for both dashboards.
    // Doctor sees all entries (including unlikely). Patient sees only
    // likely/possible entries via patientNote (patientNote is "" for unlikely).
    interpreted_diagnoses: { type: [InterpretedDiagnosisSchema], default: [] },

    // Emergency flag — merged output of LLM assessment and code-based red-flag
    // lookup in the Flask pipeline. triggered:false on all pre-existing reports.
    emergency_warning: {
      triggered: { type: Boolean, default: false },
      reason:    { type: String,  default: "" },
      message:   { type: String,  default: "" },
    },

    is_deleted: { type: Boolean, default: false },

    // Set when the patient books an appointment for this report.
    // null = self-only report (patient ran the interview but hasn't shared it with a doctor yet).
    // Non-null = report is linked to an appointment booking.
    // Written by POST /api/appointments when the patient selects which report to share.
    appointment_id: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Appointment",
      default: null,
    },

    // Flags attached by the doctor (e.g. "urgent", "abnormal_finding", "medication_interaction").
    flags: { type: [String], default: [] },
  },
  { timestamps: false }
);

ReportSchema.index({ patient_id: 1 });
ReportSchema.index({ appointment_id: 1 });

module.exports = mongoose.model("Report", ReportSchema);
