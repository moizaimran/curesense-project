// =============================================================================
// Backend/constants/specialties.js
//
// The single list of medical specialties used across CureSense:
//   · doctors pick from it at registration and on their profile (validated here)
//   · GET /api/doctors/specialties serves it to the web and mobile apps
//   · it is sent to the AI service so the patient's referral specialty is always
//     one a registered doctor can actually have
// =============================================================================

const SPECIALTIES = Object.freeze([
  "General Physician",
  "Family Medicine Specialist",
  "Internal Medicine Specialist",
  "Cardiologist",
  "Cardiac Surgeon",
  "Pulmonologist",
  "Gastroenterologist",
  "Hepatologist",
  "Nephrologist",
  "Urologist",
  "Endocrinologist",
  "Neurologist",
  "Neurosurgeon",
  "Psychiatrist",
  "Dermatologist",
  "ENT Specialist",
  "Ophthalmologist",
  "Dentist",
  "Orthopedic Surgeon",
  "Rheumatologist",
  "Physical Medicine & Rehabilitation Specialist",
  "Gynecologist",
  "Pediatrician",
  "General Surgeon",
  "Plastic Surgeon",
  "Oncologist",
  "Hematologist",
  "Infectious Disease Specialist",
  "Allergist & Immunologist",
  "Radiologist",
]);

const isValidSpecialty = (value) => SPECIALTIES.includes(value);

module.exports = { SPECIALTIES, isValidSpecialty };
