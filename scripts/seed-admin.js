// One-time script to create the first admin account.
// Run: node scripts/seed-admin.js
// Edit the credentials below before running.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
require("../config/firebase"); // initialise Firebase Admin SDK

const mongoose = require("mongoose");
const admin    = require("../config/firebase");
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
    if (existing.role === "admin") {
      console.log(`[Skip] ${ADMIN.email} already exists with role: admin`);
    } else {
      existing.role = "admin";
      await existing.save();
      console.log(`[Fixed] ${ADMIN.email} role updated → admin`);
    }
    process.exit(0);
  }

  // Create Firebase account for the admin
  let fbUser;
  try {
    fbUser = await admin.auth().createUser({ email: ADMIN.email, password: ADMIN.password, emailVerified: true, disabled: false });
    console.log(`[Firebase] Admin account created → uid: ${fbUser.uid}`);
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      fbUser = await admin.auth().getUserByEmail(ADMIN.email);
      console.log(`[Firebase] Admin account already exists → uid: ${fbUser.uid}`);
    } else throw err;
  }

  await User.create({ ...ADMIN, role: "admin", is_verified: true, provider_uid: fbUser.uid });
  console.log(`[OK] Admin created → ${ADMIN.email} / ${ADMIN.password}`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
