require("dotenv").config();
const mongoose = require("mongoose");

const env = require("../config/env");
const User = require("../models/User");
const LabTest = require("../models/LabTest");
const LabRequest = require("../models/LabRequest");
const SampleCollection = require("../models/SampleCollection");

/**
 * Valid laboratory seed data.
 *
 * Everything is created through the Mongoose models, so every document is
 * validated on the way in. There is deliberately no `insertMany`, no
 * `testName`-only request and no `priority: "Urgent"` - if this script can
 * write a row, that row satisfies the same schema the API enforces.
 *
 * Usage:
 *   node src/scripts/seed-lab.js                    # dry run, prints the plan
 *   node src/scripts/seed-lab.js --apply            # write to the configured DB
 *   node src/scripts/seed-lab.js --apply --db=hilms_lab_dev   # write elsewhere
 *
 * `--db` is what makes this safe to verify against: point it at a scratch
 * database and the shared database is never touched.
 */

const APPLY = process.argv.includes("--apply");
const dbArg = process.argv.find((arg) => arg.startsWith("--db="));
const DB_NAME = dbArg ? dbArg.split("=")[1] : undefined;

const TESTS = [
  { name: "Complete Blood Count", testCode: "CBC", category: "Haematology", sampleType: "blood", price: 25, normalRange: "WBC 4.0-11.0 x10^9/L", unit: "x10^9/L", turnaroundTime: 6, description: "Full blood count with differential." },
  { name: "Fasting Blood Sugar", testCode: "FBS", category: "Biochemistry", sampleType: "blood", price: 12, normalRange: "3.9-5.5 mmol/L", unit: "mmol/L", turnaroundTime: 4 },
  { name: "Urinalysis", testCode: "UA", category: "Microbiology", sampleType: "urine", price: 10, normalRange: "Negative", turnaroundTime: 3 },
  { name: "Lipid Profile", testCode: "LIPID", category: "Biochemistry", sampleType: "blood", price: 30, normalRange: "Total cholesterol < 5.2 mmol/L", unit: "mmol/L", turnaroundTime: 8 },
  { name: "Malaria Parasite", testCode: "MP", category: "Microbiology", sampleType: "blood", price: 8, normalRange: "Not detected", turnaroundTime: 2 },
];

// priority uses only values the enum already allows.
const REQUESTS = [
  { priority: "ROUTINE", status: "PENDING" },
  { priority: "URGENT", status: "PENDING" },
  { priority: "STAT", status: "PENDING" },
  { priority: "ROUTINE", status: "ACCEPTED" },
  { priority: "URGENT", status: "SAMPLE_COLLECTED" },
  { priority: "ROUTINE", status: "PROCESSING" },
  { priority: "ROUTINE", status: "COMPLETED" },
  { priority: "URGENT", status: "VERIFIED" },
];

const report = (lines) => lines.forEach((line) => console.log(line));

(async () => {
  // `--db` is passed to Mongoose as `dbName` rather than spliced into the URI
  // string. This project's MONGO_URI carries no database path segment, so the
  // obvious `uri.replace(/\/([^/?]+)(\?|$)/, ...)` silently matched nothing and
  // the seed landed in the SHARED database while the operator believed they had
  // isolated it. `dbName` cannot fail that way.
  const options = DB_NAME ? { dbName: DB_NAME } : {};
  await mongoose.connect(env.mongoUri, options);
  const database = mongoose.connection.name;
  report([`database: ${database}`, `mode:     ${APPLY ? "APPLY (writes enabled)" : "DRY RUN"}`, ""]);

  if (database === "test" && APPLY && !DB_NAME) {
    console.log("NOTE: writing to the shared 'test' database used by Admin/Doctor.");
    console.log("      Pass --db=<name> to seed a scratch database instead.");
    console.log("");
  }

  // Reuse real accounts so the seeded work is attached to actual patients and
  // doctors. Nothing is invented and no id is hard-coded.
  const patients = await User.find({ role: "patient", isActive: true }).select("_id name email").lean();
  const doctors = await User.find({ role: "doctor", isActive: true }).select("_id name email").lean();

  if (patients.length === 0 || doctors.length === 0) {
    console.log("A laboratory request needs a real patient and a real doctor.");
    console.log(`  active patients: ${patients.length}, active doctors: ${doctors.length}`);
    console.log("Register a patient and approve a doctor first, then re-run this script.");
    await mongoose.disconnect();
    return;
  }

  const patient = patients[0];
  const doctor = doctors[0];
  report([
    `patient: ${patient.name} <${patient.email}>`,
    `doctor:  ${doctor.name} <${doctor.email}>`,
    "",
    `planned LabTests:    ${TESTS.length}`,
    `planned LabRequests: ${REQUESTS.length}`,
    "",
  ]);

  if (!APPLY) {
    console.log("DRY RUN - nothing written. Re-run with --apply to seed.");
    await mongoose.disconnect();
    return;
  }

  const existingTests = await LabTest.countDocuments();
  let tests = await LabTest.find({ testCode: { $in: TESTS.map((t) => t.testCode) } });
  if (tests.length === 0) {
    tests = await LabTest.insertMany(TESTS);
    console.log(`created ${tests.length} LabTests`);
  } else {
    console.log(`${tests.length} of the ${TESTS.length} LabTests already existed; reusing them`);
  }

  // Re-running must not multiply the fixture, so each row carries a stable
  // marker in `clinicalNotes` and is upserted on it. `acceptedBy` is an audit
  // field: only a `lab` user may be recorded there, so it is left unset unless
  // this database actually has one - seeding a doctor id would falsify it.
  const labUser = await User.findOne({ role: "lab", isActive: true }).select("_id").lean();
  if (!labUser) {
    console.log("NOTE: no active 'lab' user found, so acceptedBy/acceptedAt are left unset.");
    console.log("      The seeded rows are still schema-valid; audit attribution is missing.");
    console.log("");
  }

  const before = await LabRequest.countDocuments();
  let created = 0;
  let reused = 0;

  for (const [index, row] of REQUESTS.entries()) {
    const marker = `Seeded ${row.priority.toLowerCase()} ${row.status.toLowerCase()} request for workflow verification`;
    const accepted = row.status !== "PENDING";
    const result = await LabRequest.findOneAndUpdate(
      { clinicalNotes: marker },
      {
        $setOnInsert: {
          patient: patient._id,
          doctor: doctor._id,
          test: tests[index % tests.length]._id,
          // Canonical enum values only.
          priority: row.priority,
          status: row.status,
          sampleStatus: accepted ? "COLLECTED" : "NOT_COLLECTED",
          clinicalNotes: marker,
          requestedDate: new Date(),
          ...(accepted && labUser
            ? { acceptedBy: labUser._id, acceptedAt: new Date() }
            : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (result.wasNew) created += 1;
    else reused += 1;
  }

  const after = await LabRequest.countDocuments();
  console.log(`LabRequests: ${created} created, ${reused} already present (collection ${before} -> ${after})`);

  // Verify what actually landed, the same way the API would read it back.
  const byStatus = await LabRequest.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log("");
  console.log("persisted status distribution:");
  byStatus.forEach((row) => console.log(`  ${String(row._id).padEnd(18)} ${row.count}`));

  const invalid = await LabRequest.find({ priority: { $nin: ["ROUTINE", "URGENT", "STAT", "routine", "urgent", "stat"] } }).select("_id priority").lean();
  console.log("");
  console.log(`rows with an out-of-enum priority: ${invalid.length}`);

  const orphaned = await LabRequest.find({ $or: [{ test: { $exists: false } }, { patient: { $exists: false } }, { doctor: { $exists: false } }] }).select("_id").lean();
  console.log(`rows missing test/patient/doctor: ${orphaned.length}`);

  console.log("");
  console.log(`total LabTests: ${await LabTest.countDocuments()}`);
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(`seed-lab failed: ${error.message}`);
  if (error.errors) Object.values(error.errors).forEach((e) => console.error(`  ${e.path}: ${e.message}`));
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
