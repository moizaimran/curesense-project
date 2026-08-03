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

// Doctor report sub-schemas
const GuidelineConsiderationSchema = new mongoose.Schema(
  {
    point:    { type: String, default: "" },
    citation: { type: String, default: "" },
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

// Patient summary sub-schemas
const TopDiagnosisSchema = new mongoose.Schema(
  {
    disease:    { type: String, default: "" },
    confidence: { type: Number, default: 0  },
  },
  { _id: false }
);

const AppointmentGuidanceItemSchema = new mongoose.Schema(
  {
    point:  { type: String, default: "" },
    source: { type: String, default: "" },
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
    specialty:        { type: String, default: "" },
    rag_query:        { type: String, default: "" },
    entities:         { type: [EntitySchema],         default: [] },
    disease_ranking:  { type: [DiseaseRankSchema],    default: [] },
    retrieved_chunks: { type: [RetrievedChunkSchema], default: [] },
    openfda_results:  { type: mongoose.Schema.Types.Mixed, default: {} },

    doctor_report: {
      patientComplaintSummary:       { type: String,                         default: "" },
      topDiagnoses:                  { type: [TopDiagnosisSchema],           default: [] },
      interviewClinicalSummary:      { type: String,                         default: "" },
      retrievalAndMedicationSummary: { type: String,                         default: "" },
      recommendedSpecialty:          { type: String,                         default: "" },
      specialtyReasoning:            { type: String,                         default: "" },
      guidelineConsiderations:       { type: [GuidelineConsiderationSchema], default: [] },
      medicationFlags:               { type: [MedicationFlagSchema],         default: [] },
      retrievalStatus:               { type: String,                         default: "" },
      confidenceNote:                { type: String,                         default: "" },
    },

    patient_summary: {
      patientComplaintSummary: { type: String,                         default: "" },
      referralSpecialty:       { type: String,                         default: "" },
      topDiagnoses:            { type: [TopDiagnosisSchema],           default: [] },
      appointmentGuidance:     { type: [AppointmentGuidanceItemSchema],default: [] },
      medicationNotes:         { type: [MedicationNoteSchema],         default: [] },
    },
  },
  { timestamps: false }
);

ReportSchema.index({ patient_id: 1 });

module.exports = mongoose.model("Report", ReportSchema);
