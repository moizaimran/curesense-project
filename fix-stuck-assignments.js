/**
 * fix-stuck-assignments.js
 *
 * ONE-TIME data fix.
 *
 * Background:
 * adminReviewAppointment used to only reactivate a PatientDoctorAssignment
 * (set it back to "active") when its status was "pending". If a patient
 * had ever cancelled an appointment (which sets the assignment to
 * "terminated") and later booked again with the same doctor, approving
 * the new appointment never brought the assignment back to "active" —
 * so that patient permanently disappeared from "Total Assigned Patients"
 * (which counts assignments with status: "active"), even though they
 * had a confirmed/completed appointment.
 *
 * The controller code is now fixed for FUTURE approvals. This script
 * fixes EXISTING data: it finds any assignment that is "terminated" but
 * has at least one appointment with status "confirmed" or "completed",
 * and reactivates it.
 *
 * USAGE (run from your curesense-backend folder, same as the other
 * migration scripts):
 *   Dry run (no writes):
 *     set DRY_RUN=true
 *     node fix-stuck-assignments.js
 *
 *   Real run:
 *     set DRY_RUN=
 *     node fix-stuck-assignments.js
 */

try {
  require("dotenv").config();
} catch (e) {
  console.warn("Note: dotenv not found — set MONGODB_URI manually if needed.");
}

const { MongoClient, ObjectId } = require("mongodb");

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
const ASSIGNMENTS_COLLECTION = "patientdoctorassignments"; // default Mongoose pluralization
const APPOINTMENTS_COLLECTION = "appointments";
const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  if (!MONGODB_URI) {
    console.error(
      `Could not find a MongoDB connection string under any of: ${ENV_VAR_CANDIDATES.join(", ")}.`
    );
    process.exit(1);
  }

  console.log(`Connecting to MongoDB... (${DRY_RUN ? "DRY RUN — no writes will happen" : "LIVE RUN — will write changes"})`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const db = client.db(process.env.MONGODB_DB || undefined);
    const assignments = db.collection(ASSIGNMENTS_COLLECTION);
    const appointments = db.collection(APPOINTMENTS_COLLECTION);

    const terminated = await assignments
      .find({ status: "terminated" })
      .toArray();

    console.log(`Found ${terminated.length} assignment(s) with status "terminated".\n`);

    let reactivated = 0;

    for (const assignment of terminated) {
      // Look for the most recent confirmed/completed appointment under
      // this assignment.
      const goodAppointment = await appointments.findOne(
        {
          assignment_id: assignment._id,
          status: { $in: ["confirmed", "completed"] },
        },
        { sort: { created_at: -1 } }
      );

      if (!goodAppointment) {
        // Genuinely terminated (no active appointment since) — leave it alone.
        continue;
      }

      console.log(
        `  Assignment ${assignment._id} (patient ${assignment.patient_id}, doctor ${assignment.doctor_id}) ` +
        `has a "${goodAppointment.status}" appointment — reactivating.`
      );

      reactivated++;

      if (!DRY_RUN) {
        await assignments.updateOne(
          { _id: assignment._id },
          {
            $set: {
              status: "active",
              first_appointment_id: assignment.first_appointment_id || goodAppointment._id,
              activated_at: new Date(),
            },
          }
        );
      }
    }

    console.log("\n── Summary ─────────────────────────────");
    console.log(`Terminated assignments checked: ${terminated.length}`);
    console.log(`Reactivated (had a confirmed/completed appointment): ${reactivated}`);
    console.log(`Left as-is (no confirmed/completed appointment):      ${terminated.length - reactivated}`);

    if (DRY_RUN) {
      console.log("\nThis was a DRY RUN — nothing was written.");
      console.log("Re-run with DRY_RUN unset (empty) to apply these changes.");
    } else {
      console.log("\nDone. Changes have been written to the database.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});