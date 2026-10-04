require("dotenv").config();
const mongoose = require("mongoose");

const env = require("../config/env");

// Loading the models is what registers their schema-declared indexes.
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const LabReport = require("../models/LabReport");
const LabRequest = require("../models/LabRequest");
const LabResult = require("../models/LabResult");

/**
 * Creates the compound indexes declared on the doctor-module schemas.
 *
 * WHY A SCRIPT AND NOT `autoIndex`
 * -------------------------------
 * Same reasoning as sync-lab-indexes: index creation on a populated collection
 * is expensive and should be deliberate and reported, not a surprise.
 *
 * The indexes that matter most for correctness, not just speed:
 *  - DoctorPatientAssignment's unique partial index makes a double assignment
 *    impossible at the database level, not just in application code.
 *  - LabReport's { patient, test, generatedAt } backs the report comparison
 *    screen, which always narrows to one patient and one test before sorting.
 *  - { doctor, patient, appointmentDate } backs the dashboard's today query.
 *
 * Nothing here writes documents. `--dry-run` (the default) only reports.
 */

const DRY_RUN = !process.argv.includes("--apply");

const TARGETS = [
  ["Appointment", Appointment],
  ["Consultation", Consultation],
  ["Prescription", Prescription],
  ["DoctorPatientAssignment", DoctorPatientAssignment],
  ["LabReport", LabReport],
  ["LabRequest", LabRequest],
  ["LabResult", LabResult],
];

(async () => {
  await mongoose.connect(env.mongoUri);
  console.log(`database: ${mongoose.connection.name}`);
  console.log(`mode:     ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("");

  for (const [name, Model] of TARGETS) {
    const declared = Model.schema.indexes();
    if (declared.length === 0) {
      console.log(`${name}: no indexes declared`);
      continue;
    }

    const collection = mongoose.connection.db.collection(Model.collection.name);

    // A collection that has never held a document reports an error rather than
    // an empty index list. That is not a failure: it just means every declared
    // index below is genuinely new.
    const exists = await mongoose.connection.db
      .listCollections({ name: Model.collection.name }, { nameOnly: true })
      .hasNext();
    const existing = exists
      ? await collection.indexes()
      : [];

    console.log(`${name} (${Model.collection.name})${exists ? "" : "  [collection not created yet]"}`);
    for (const [fields, options] of declared) {
      const key = JSON.stringify(fields);
      const alreadyThere = existing.some((index) => JSON.stringify(index.key) === key);
      const label = options?.name ? `[${options.name}]` : "";

      if (alreadyThere) {
        console.log(`  = ${key}  ${label}  (already present)`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  + ${key}  ${label}  would be created`);
        continue;
      }

      await collection.createIndex(fields, options || {});
      console.log(`  + ${key}  ${label}  created`);
    }
    console.log("");
  }

  if (DRY_RUN) console.log("DRY RUN - no indexes created. Re-run with --apply.");
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(`sync-doctor-indexes failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
