// CJS stub — replaces firebase-admin/app in all Jest test files.
// Prevents ESM parse errors from jose/jwks-rsa inside firebase-admin.
module.exports = {
  initializeApp: jest.fn(),
  getApps:       jest.fn(() => [{}]),
  cert:          jest.fn(x => x),
};
