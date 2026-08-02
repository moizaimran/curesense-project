// =============================================================================
// Backend/models/Session.js
// =============================================================================
const mongoose = require("mongoose");

// One entry per completed exchange (patient turn + assistant reply)
const TurnSchema = new mongoose.Schema(
  {
    turn_number:       { type: Number, required: true },
    patient_raw:       { type: String, required: true }, // as received: raw text or Whisper output
    patient_corrected: { type: String, required: true }, // after LLM spelling-correction pass
    assistant_message: { type: String, required: true }, // question or closing line from LLM
    voice_message_url: { type: String, default: null  }, // Cloudinary URL — null for text turns
  },
  { _id: false }
);

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

const SessionSchema = new mongoose.Schema(
  {
    patient_id:       { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    started_at:       { type: Date, default: Date.now },
    completed_at:     { type: Date, default: null  },
    last_activity_at: { type: Date, default: Date.now },
    status: {
      type:    String,
      enum:    ["in_progress", "completed", "failed", "abandoned"],
      default: "in_progress",
    },
    turn_count:      { type: Number, default: 0 },
    transcript:      { type: [TurnSchema],        default: [] },
    // populated only after /pipeline/finalize completes
    entities:        { type: [EntitySchema],      default: [] },
    disease_ranking: { type: [DiseaseRankSchema], default: [] },
    rag_query:       { type: String, default: "" },
  },
  { timestamps: false }
);

// Refresh last_activity_at whenever the transcript grows (new turn added)
SessionSchema.pre("save", function (next) {
  if (this.isModified("transcript")) {
    this.last_activity_at = new Date();
  }
  next();
});

// Speeds up get_sessions_for_patient lookups
SessionSchema.index({ patient_id: 1 });

module.exports = mongoose.model("Session", SessionSchema);
