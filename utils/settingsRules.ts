// Client-side checks matching the backend rules, so users get instant feedback.

// Backend: utils/validation.js → isStrongPassword
export function passwordProblem(pw: string) {
  if (!pw || pw.length < 8) return "New password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(pw)) return "New password must include a letter.";
  if (!/\d/.test(pw)) return "New password must include a number.";
  return "";
}

// Backend: patientService.updatePatientProfile (empty = remove the number)
export function phoneProblem(phone: string) {
  const p = (phone || "").replace(/[\s-]/g, "");
  if (p && !/^(\+92|0)3\d{9}$/.test(p)) return "Enter a mobile number like 03001234567.";
  return "";
}
