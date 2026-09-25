// Resets password for a patient account by email.
// Run: node scripts/reset-patient-password.js
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const User     = require("../models/User");

const TARGET = {
  email:       "hmarwat50@gmail.com",
  newPassword: "Patient@1234",
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "curesense" });
  console.log("[DB] Connected");

  const user = await User.findOne({ email: TARGET.email });
  if (!user) {
    console.log(`[Not found] No user with email: ${TARGET.email}`);
    process.exit(1);
  }

  console.log(`[Found] ${user.name} — role: ${user.role}`);
  user.password = TARGET.newPassword; // pre-save hook hashes it
  await user.save();
  console.log(`[Done] Password reset to: ${TARGET.newPassword}`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
