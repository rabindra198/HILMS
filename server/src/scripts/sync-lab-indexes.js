require("dotenv").config();
const mongoose = require("mongoose");

const env = require("../config/env");

// Loading the models is what registers their schema-declared indexes.
const LabRequest = require("../models/LabRequest");
const SampleCollection = require("../models/SampleCollection");
const LabResult = require("../models/LabResult");
const LabReport = require("../models/LabReport");
const Notification = require("../models/Notification");
const LabTest = require("../models/LabTest");
const User = require("../models/User");

/**
 * Brings the laboratory indexes in the database into line with the schemas.
 *
 * WHY A SCRIPT AND NOT `autoIndex`
 * -------------------------------
 * Mongoose builds indexes automatically in development, but on a populated
 * collection that is a surprise, expensive operation with no output. Index
 * creation is therefore explicit, idempotent and reports exactly what it did.
 *
 * WHY IT ALSO REPAIRS MISMATCHES
 * ------------------------------
 * `createIndexes` only ever ADDS what is missing. It never notices that an
 * existing index has the same key but different options - and `unique` is the
 * option that bites. `LabReport.labRequest` used to be declared unique, which
 * meant one report per laboratory request. It is no longer unique, because a
 * corrected report is issued as a SECOND report on the same request
 * (FR-LB-05 revision). The stale unique index survives in an existing database,
 * so the revision path fails with a duplicate-key error that no schema change
 * can fix on its own.
 *
 * So for each declared index the key AND the uniqueness are compared, and a
 * mismatch is repaired by dropping and recreating. An index that is present in
 * the database but not declared is only reported - deleting it is never safe to
 * infer from a schema alone.
 *
 * Nothing here writes documents. `--dry-run` (the default) only reports what
 * would change.
 */

const DRY_RUN = !process.argv.includes("--apply");

const TARGETS = [
  ["LabRequest", LabRequest],
  ["SampleCollection", SampleCollection],
  ["LabResult", LabResult],
  ["LabReport", LabReport],
  ["Notification", Notification],
  ["LabTest", LabTest],
  ["User", User],
];

(async () => {
  await mongoose.connect(env.mongoUri);
  const database = mongoose.connection.name;
  console.log(`database: ${database}`);
  console.log(`mode:     ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log("");

  let repaired = 0;
  let created = 0;

  for (const [name, Model] of TARGETS) {
    const declared = Model.schema.indexes();
    if (declared.length === 0) {
      console.log(`${name}: no indexes declared`);
      continue;
    }

    const collection = mongoose.connection.db.collection(Model.collection.name);
    const existing = await collection.indexes();
    let headerPrinted = false;

    const printHeader = () => {
      if (headerPrinted) return;
      console.log(`${name} (${Model.collection.name})`);
      headerPrinted = true;
    };

    for (const [fields, options] of declared) {
      const key = JSON.stringify(fields);
      const wantUnique = Boolean(options?.unique);
      const match = existing.find((index) => JSON.stringify(index.key) === key);
      const label = options?.name ? `[${options.name}]` : "";

      if (!match) {
        printHeader();
        if (DRY_RUN) {
          console.log(`  + ${key}  ${label}  would be created`);
        } else {
          await collection.createIndex(fields, options || {});
          console.log(`  + ${key}  ${label}  created`);
        }
        created += 1;
        continue;
      }

      // Same key, different uniqueness: the stale index is the dangerous case,
      // because it silently rejects documents the application considers valid.
      if (Boolean(match.unique) !== wantUnique) {
        printHeader();
        const from = match.unique ? "unique" : "non-unique";
        const to = wantUnique ? "unique" : "non-unique";
        if (DRY_RUN) {
          console.log(`  ! ${key}  ${label}  is ${from}, schema says ${to} - would be recreated`);
        } else {
          await collection.dropIndex(match.name);
          await collection.createIndex(fields, options || {});
          console.log(`  ! ${key}  ${label}  was ${from}, schema says ${to} - recreated`);
        }
        repaired += 1;
        continue;
      }

      printHeader();
      console.log(`  = ${key}  ${label}  (already present)`);
    }

    // Informational only: never dropped. A schema is not proof that an index is
    // unnecessary, and dropping the wrong one is slow to notice.
    const declaredKeys = new Set(declared.map(([fields]) => JSON.stringify(fields)));
    const undeclared = existing.filter(
      (index) => index.name !== "_id_" && !declaredKeys.has(JSON.stringify(index.key))
    );
    if (undeclared.length) {
      printHeader();
      for (const index of undeclared) {
        console.log(
          `  ? ${JSON.stringify(index.key)}  [${index.name}]  in database but not declared - left alone`
        );
      }
    }

    if (headerPrinted) console.log("");
  }

  console.log(
    DRY_RUN
      ? `DRY RUN - ${created} would be created, ${repaired} would be repaired. Re-run with --apply.`
      : `done - ${created} created, ${repaired} repaired.`
  );
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(`sync-indexes failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
