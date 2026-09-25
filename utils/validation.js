// Minimum 8 characters with at least one letter and one number.
function isStrongPassword(pw) {
  return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

// Basic structural email check — not a regex so no backtracking risk.
function validateEmail(email) {
  const at  = email.indexOf("@");
  const dot = email.lastIndexOf(".");
  return at > 0 && dot > at + 1 && dot < email.length - 1 && !/\s/.test(email);
}

module.exports = { isStrongPassword, validateEmail };
