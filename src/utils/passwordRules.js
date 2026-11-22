// Same rule as the backend (utils/validation.js → isStrongPassword).
// Returns a message describing what's wrong, or "" if the password is OK.
export function passwordProblem(pw) {
    if (!pw || pw.length < 8) return "New password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(pw)) return "New password must include a letter.";
    if (!/\d/.test(pw)) return "New password must include a number.";
    return "";
}
