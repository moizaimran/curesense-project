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

const ClinicalConsiderationSchema = new mongoose.Schema(
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

const WhatToExpectSchema = new mongoose.Schema(
  {
    point:  { type: String, default: "" },
    source: { type: String, default: "" },
  },
  { _id: false }
);

const YourMedicationsSchema = new mongoose.Schema(
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
      unique:   true,   // one report per session — enforced at DB level
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
      specialtyRecommendation: { type: String, default: "" },
      specialtyReasoning:      { type: String, default: "" },
      clinicalConsiderations:  { type: [ClinicalConsiderationSchema], default: [] },
      medicationFlags:         { type: [MedicationFlagSchema],        default: [] },
      retrievalStatus:         { type: String, default: "" },
      confidenceNote:          { type: String, default: "" },
    },
    patient_summary: {
      whatWeHeard:     { type: String,              default: "" },
      specialty:       { type: String,              default: "" },
      whatToExpect:    { type: [WhatToExpectSchema],    default: [] },
      yourMedications: { type: [YourMedicationsSchema], default: [] },
    },
  },
  { timestamps: false }
);

// Speeds up get_reports_for_patient lookups
ReportSchema.index({ patient_id: 1 });

module.exports = mongoose.model("Report", ReportSchema);
