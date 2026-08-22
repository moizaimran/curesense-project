module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  // Give mongodb-memory-server time to download its binary on first run
  testTimeout: 30000,
  // Suppress Mongoose deprecation warnings in test output
  verbose: true,
};
