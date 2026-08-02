// =============================================================================
// Backend/config/db.js — Mongoose connection to MongoDB Atlas
// =============================================================================
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || "curesense",
    });
    console.log(`[MongoDB] Connected → ${conn.connection.host}`);
  } catch (err) {
    console.error(`[MongoDB] Connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
