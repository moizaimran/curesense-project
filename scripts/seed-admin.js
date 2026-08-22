// One-time script to create the first admin account.
// Run: node scripts/seed-admin.js
// Edit the credentials below before running, then delete this file.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const User     = require("../models/User");

const ADMIN = {
  name:     "Admin",
  email:    "admin@curesense.com",
  password: "Admin@1234",
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "curesense" });
  console.log("[DB] Connected");

  const existing = await User.findOne({ email: ADMIN.email });
  if (existing) {
    console.log(`[Skip] ${ADMIN.email} already exists (role: ${existing.role})`);
    process.exit(0);
  }

  await User.create({ ...ADMIN, role: "admin" });
  console.log(`[OK] Admin created → ${ADMIN.email} / ${ADMIN.password}`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
