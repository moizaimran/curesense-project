/**
 * inspect-availability-dates.js
 *
 * READ-ONLY — makes no changes to the database.
 *
 * Place this file inside your `curesense-backend` folder (same level as
 * package.json / .env) and run it from there:
 *
 *     node inspect-availability-dates.js
 *
 * It will automatically load your existing .env file (via dotenv, which
 * your backend almost certainly already has installed since it connects
 * to MongoDB) and try common variable names for the connection string:
 * MONGODB_URI, MONGO_URI, DATABASE_URL, DB_URI, MONGO_URL.
 *
 * If none of those match what your project actually uses, open your
 * server's DB-connection file (wherever mongoose.connect(...) is called)
 * and check what env variable name it reads — then either rename it in
 * .env to MONGODB_URI, or edit the ENV_VAR_CANDIDATES list below to add
 * your actual variable name.
 *
 * This script reports, for every DoctorAvailability document, whether
 * each exception's `date` field is:
 *   - a proper "YYYY-MM-DD" string (already fine)
 *   - a raw Date object (the old bug — needs migration)
 *   - something else unexpected
 *
 * Run this FIRST, before running fix-availability-dates.js.
 */

try {
  require("dotenv").config();
} catch (e) {
  console.warn("Note: dotenv not found — if your .env isn't loaded another way, set MONGODB_URI manually when running this script.");
}

const { MongoClient } = require("mongodb");

const ENV_VAR_CANDIDATES = ["MONGODB_URI", "MONGO_URI", "DATABASE_URL", "DB_URI", "MONGO_URL"];

function resolveConnectionString() {
  for (const key of ENV_VAR_CANDIDATES) {
    if (process.env[key]) {
      console.log(`Using connection string from env variable: ${key}`);
      return process.env[key];
    }
  }
  return null;
}

const MONGODB_URI = resolveConnectionString();
const COLLECTION_NAME = "doctoravailabilities";
const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  if (!MONGODB_URI) {
    console.error(
      `Could not find a MongoDB connection string in your .env under any of: ${ENV_VAR_CANDIDATES.join(", ")}.\n` +
      `Check your DB-connection file for the actual env variable name, then either rename it in .env or edit ENV_VAR_CANDIDATES in this script.`
    );
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db(process.env.MONGODB_DB || undefined);
    const collection = db.collection(COLLECTION_NAME);

    const docs = await collection.find({ "exceptions.0": { $exists: true } }).toArray();
    console.log(`\nFound ${docs.length} doctor availability document(s) with at least one exception.\n`);

    let totalExceptions = 0;
    let goodStrings = 0;
    let badDates = 0;
    let unknown = 0;

    for (const doc of docs) {
      console.log(`doctor_id: ${doc.doctor_id}`);
      for (const ex of doc.exceptions || []) {
        totalExceptions++;
        const raw = ex.date;

        if (typeof raw === "string" && DATE_STRING_RE.test(raw)) {
          goodStrings++;
          console.log(`   OK         "${raw}"`);
        } else if (raw instanceof Date && !isNaN(raw.getTime())) {
          badDates++;
          console.log(`   NEEDS FIX   Date object -> ${raw.toISOString()}  (would become "${raw.toISOString().slice(0, 10)}" +1 day after migration)`);
        } else {
          unknown++;
          console.log(`   UNKNOWN    `, raw);
        }
      }
      console.log("");
    }

    console.log("── Summary ─────────────────────────────");
    console.log(`Total exception entries checked: ${totalExceptions}`);
    console.log(`Already correct (string):        ${goodStrings}`);
    console.log(`Needs migration (Date object):   ${badDates}`);
    console.log(`Unknown/unexpected format:        ${unknown}`);

    if (badDates > 0) {
      console.log("\n➡️  Run fix-availability-dates.js to correct these.");
    } else if (totalExceptions > 0) {
      console.log("\n✅ All exception dates are already in the correct string format.");
      console.log("   If the error is still happening, the problem is elsewhere.");
    } else {
      console.log("\nNo exceptions found in the database at all.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});
