// CJS stub — replaces firebase-admin/auth in all Jest test files.
//
// Smart decode: test files that still use jwt.sign({ id: userId }, ...) as
// their bearer token are handled transparently. The stub decodes the JWT
// without verifying the signature, extracts decoded.id, and returns that as
// the Firebase uid. Users created in those tests must set provider_uid to
// their _id.toString() for User.findOne({ provider_uid }) to succeed.
//
// Test files that need full control (e.g. auth.test.js) override this stub
// entirely with their own jest.mock('firebase-admin/auth', factory).

let _jwtDecode;
try { _jwtDecode = require("jsonwebtoken").decode; } catch { _jwtDecode = null; }

const authInstance = {
  verifyIdToken: jest.fn().mockImplementation(async (token) => {
    if (_jwtDecode) {
      const decoded = _jwtDecode(token);
      if (decoded?.id) return { uid: String(decoded.id), email_verified: true };
    }
    throw Object.assign(new Error("auth/id-token-invalid"), { code: "auth/id-token-invalid" });
  }),
  createUser:                    jest.fn().mockImplementation(async ({ email }) => ({ uid: `uid-${email.split("@")[0]}`, email })),
  getUserByEmail:                jest.fn().mockResolvedValue({ uid: "test-uid", emailVerified: true }),
  getUser:                       jest.fn().mockResolvedValue({ uid: "test-uid", emailVerified: true }),
  generateEmailVerificationLink: jest.fn().mockResolvedValue("http://fake-verify-link"),
  generatePasswordResetLink:     jest.fn().mockResolvedValue("http://fake-reset-link"),
  updateUser:                    jest.fn().mockResolvedValue(undefined),
  deleteUser:                    jest.fn().mockResolvedValue(undefined),
};

module.exports = { getAuth: jest.fn(() => authInstance) };
