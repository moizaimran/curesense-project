// =============================================================================
// Backend/models/DoctorProfile.js
//
// One document per doctor — links 1-to-1 with a User (role:"doctor").
// status lifecycle: pending → verified | rejected
//   pending  → doctor signed up, admin hasn't reviewed PMDC yet
//   verified → admin approved; doctor appears in patient search
//   rejected → admin rejected; doctor is notified of reason
// =============================================================================
const mongoose = require("mongoose");

const EducationEntrySchema = new mongoose.Schema(
  {
    degree:      { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    year:        { type: Number, required: true },
  },
  { _id: false }
);

const DoctorProfileSchema = new mongoose.Schema(
  {
    // Owning user account
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // PMDC registration number — unique identifier for the doctor
    pmdc_number: {
      type:      String,
      required:  true,
      unique:    true,
      trim:      true,
      uppercase: true,
    },

    // Full name as it appears on the doctor's CNIC — used for PMDC fuzzy matching
    name_as_per_cnic:        { type: String, required: true, trim: true },
    // Father's name as on CNIC — second data point for PMDC identity verification
    father_name_as_per_cnic: { type: String, required: true, trim: true },

    specialty:     { type: String, required: true, trim: true },
    sub_specialty: { type: String, default: "",    trim: true },

    gender: {
      type:     String,
      enum:     ["male", "female"],
      required: true,
    },

    location: {
      country: { type: String, default: "Pakistan" },
      city:    { type: String, required: true, trim: true },
      address: { type: String, default: "",    trim: true },
    },

    contact: {
      phone: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
    },

    // Structured education — array of { degree, institution, year }
    education: { type: [EducationEntrySchema], default: [] },

    experience_years: { type: Number, default: 0, min: 0 },
    hospital_clinic:  { type: String, default: "", trim: true },

    // URL of the PMDC certificate uploaded during registration
    pmdc_certificate_url: { type: String, default: "" },

    // URL of CNIC image uploaded during registration (stored in Cloudinary)
    cnic_image_url: { type: String, default: "" },

    // ── PMDC automated verification result (populated after registration) ────
    pmdc_verification: {
      pmdc_found:       { type: Boolean, default: null },
      pmdc_name:        { type: String,  default: "" },
      pmdc_father_name: { type: String,  default: "" },
      pmdc_status:      { type: String,  default: "" },
      confidence:       { type: Number,  default: null },
      decision: {
        type:    String,
        enum:    ["auto_approved", "flagged", "rejected", "pending"],
        default: "pending",
      },
      breakdown:  { type: mongoose.Schema.Types.Mixed, default: {} },
      checked_at: { type: Date, default: null },
    },

    // ── Admin verification state ──────────────────────────────────────────────
    // pending  → awaiting admin review (default on signup)
    // verified → admin approved PMDC; appears in patient search
    // rejected → admin rejected; doctor cannot be booked
    status: {
      type:    String,
      enum:    ["pending", "verified", "rejected"],
      default: "pending",
    },
    rejection_reason: { type: String, default: "" },
    verified_by:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verified_at:      { type: Date, default: null },

    // ── Consultation fee (PKR) — set by the doctor, shown before booking ──────
    // 0 = free consultation (no payment step). Paid to the CureSense admin
    // account, never directly to the doctor.
    consultation_fee: { type: Number, default: 0, min: 0, max: 100000 },

    // ── Rating summary (kept in sync by services/reviewService.js) ────────────
    // Average 1–5 stars from patients; count = number of reviews.
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count:   { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Fast lookup by specialty for patient search
DoctorProfileSchema.index({ specialty: 1, status: 1 });
DoctorProfileSchema.index({ "location.city": 1 });
DoctorProfileSchema.index({ "rating.average": -1 });

module.exports = mongoose.model("DoctorProfile", DoctorProfileSchema);
