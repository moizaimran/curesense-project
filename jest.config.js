module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  testTimeout: 30000,
  verbose: true,
  // Map firebase-admin sub-packages to CJS stubs so jest doesn't choke on
  // the ESM-only 'jose' dependency bundled inside firebase-admin.
  moduleNameMapper: {
    "^firebase-admin/app$":  "<rootDir>/tests/__mocks__/firebase-admin-app.js",
    "^firebase-admin/auth$": "<rootDir>/tests/__mocks__/firebase-admin-auth.js",
  },
};
