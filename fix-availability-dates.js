/**
 * fix-availability-dates.js
 *
 * ONE-TIME migration script.
 *
 * Background:
 * The `exceptions.date` field in DoctorAvailability used to be stored as
 * a Mongo `Date`. The old frontend code built that date using
 * `.toISOString()`, which converts to UTC first — for timezones AHEAD of
 * UTC (e.g. Pakistan, UTC+5), this shifted the saved date back by one day.
 *
 * The schema has now been fixed to store `date` as a plain "YYYY-MM-DD"
 * string. But documents saved BEFORE this fix still have raw `Date`
 * values sitting in MongoDB. When the app (with the new String schema)
 * reads them, Mongoose force-casts them via `.toString()`, producing
 * garbage like "Thu Sep 10 2026 00:00:00 GMT+0500..." — which then fails
 * the `match` validator on save. That's the "Path `date` is invalid"
 * error you're seeing.
 *
 * This script:
 *   1. Talks to MongoDB directly (native driver, NOT the Mongoose model)
 *      so it isn't affected by the current schema's casting/validation.
 *   2. For every DoctorAvailability doc, looks at each exception's `date`.
 *   3. If it's still a real Date object, adds +1 day (to undo the bug's
 *      shift) and rewrites it as a clean "YYYY-MM-DD" string.
 *   4. If it's already a correct string, leaves it alone (idempotent —
 *      safe to run more than once).
 *
 * USAGE:
 *   1. BACK UP your database first (mongodump), just in case.
 *   2. Dry run (no writes, just logs what WOULD change):
 *        DRY_RUN=true MONGODB_URI="<your connection string>" node fix-availability-dates.js
 *   3. Review the log output carefully.
 *   4. Real run (writes changes):
 *        MONGODB_URI="<your connection string>" node fix-availability-dates.js
 *
 * Adjust MONGODB_URI / COLLECTION_NAME below if your setup differs.
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
const COLLECTION_NAME = "doctoravailabilities"; // default Mongoose pluralization of "DoctorAvailability"
const DRY_RUN = process.env.DRY_RUN === "true";

const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatUtcYyyyMmDd(date) {
  const year  = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function main() {
  if (!MONGODB_URI) {
    console.error(
      `Could not find a MongoDB connection string in your .env under any of: ${ENV_VAR_CANDIDATES.join(", ")}.\n` +
      `Check your DB-connection file for the actual env variable name, then either rename it in .env or edit ENV_VAR_CANDIDATES in this script.`
    );
    process.exit(1);
  }

  console.log(`Connecting to MongoDB... (${DRY_RUN ? "DRY RUN — no writes will happen" : "LIVE RUN — will write changes"})`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db(process.env.MONGODB_DB || undefined);
    const collection = db.collection(COLLECTION_NAME);

    const docs = await collection.find({ "exceptions.0": { $exists: true } }).toArray();
    console.log(`Found ${docs.length} doctor availability document(s) with exceptions.`);

    let docsChanged = 0;
    let entriesChanged = 0;
    let entriesAlreadyOk = 0;
    let entriesUnrecognized = 0;

    for (const doc of docs) {
      let changed = false;

      const newExceptions = (doc.exceptions || []).map((ex) => {
        const raw = ex.date;

        // Already a correct string — leave as-is.
        if (typeof raw === "string" && DATE_STRING_RE.test(raw)) {
          entriesAlreadyOk++;
          return ex;
        }

        // A real Date object (the buggy old format) — correct it.
        if (raw instanceof Date && !isNaN(raw.getTime())) {
          const corrected = new Date(raw.getTime() + 24 * 60 * 60 * 1000); // +1 day
          const fixedString = formatUtcYyyyMmDd(corrected);
          console.log(
            `  doctor_id=${doc.doctor_id}  ${raw.toISOString()}  ->  "${fixedString}"`
          );
          changed = true;
          entriesChanged++;
          return { ...ex, date: fixedString };
        }

        // Something we don't recognize (string in wrong format, etc.)
        // Leave untouched but flag it for manual review.
        console.warn(
          `  ⚠️  doctor_id=${doc.doctor_id} has an unrecognized date value, skipping:`,
          raw
        );
        entriesUnrecognized++;
        return ex;
      });

      if (changed) {
        docsChanged++;
        if (!DRY_RUN) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: { exceptions: newExceptions } }
          );
        }
      }
    }

    console.log("\n── Summary ─────────────────────────────");
    console.log(`Documents changed:            ${docsChanged}`);
    console.log(`Exception entries corrected:  ${entriesChanged}`);
    console.log(`Entries already correct:      ${entriesAlreadyOk}`);
    console.log(`Entries left unrecognized:    ${entriesUnrecognized}`);
    if (DRY_RUN) {
      console.log("\nThis was a DRY RUN — nothing was written.");
      console.log("Re-run without DRY_RUN=true to apply these changes.");
    } else {
      console.log("\nDone. Changes have been written to the database.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
