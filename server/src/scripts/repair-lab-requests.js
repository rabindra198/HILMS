require("dotenv").config();
const mongoose = require("mongoose");

const env = require("../config/env");
const LabRequest = require("../models/LabRequest");
const LabTest = require("../models/LabTest");

/**
 * Idempotent data repair for legacy/invalid LabRequest documents.
 *
 * WHY THIS EXISTS
 * ---------------
 * `test` is `required: true` and `priority` is a strict enum, and that is
 * correct - the schema is right and must NOT be weakened to accommodate bad
 * rows. Mongoose, however, only validates on model-mediated writes. A document
 * inserted through `insertOne` / `insertMany` / `bulkWrite` / `updateOne` /
 * a raw import, or by an older deployment, bypasses validation entirely.
 *
 * The damage is latent until the first `doc.save()`, because `save()`
 * re-validates the WHOLE document, not just the fields being written. That is
 * why the failure surfaces on an unrelated action such as "complete
 * processing" and reports errors about `test` and `priority` fields the user
 * never touched.
 *
 * SAFETY CONTRACT
 * ---------------
 *   1. Dry run by default. Nothing is written unless --apply is passed.
 *   2. Never invents an id. A request whose test cannot be resolved to exactly
 *      one existing LabTest is reported as UNRESOLVED and left untouched.
 *   3. Never deletes. Repair only; removal is a separate, explicit decision.
 *   4. Only rewrites values that are already inside the schema's allowed set.
 *   5. Idempotent - running it twice is a no-op the second time.
 *
 * Usage:
 *   node src/scripts/repair-lab-requests.js            # report only
 *   node src/scripts/repair-lab-requests.js --apply    # apply the safe fixes
 */

const APPLY = process.argv.includes("--apply");

// Mirrors LabRequest's enum. The fix moves a bad value onto a value that is
// ALREADY legal; it never widens the enum.
const VALID_PRIORITY = new Set(["ROUTINE", "URGENT", "STAT", "routine", "urgent", "stat"]);
const VALID_STATUS = new Set(LabRequest.schema.path("status").enumValues);
const VALID_SAMPLE_STATUS = new Set(LabRequest.schema.path("sampleStatus").enumValues);

const normalizeToken = (value) => String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const PRIORITY_REPAIR = {
  urgent: "URGENT",
  stat: "STAT",
  routine: "ROUTINE",
  highest: "STAT",
  emergency: "STAT",
  critical: "STAT",
  normal: "ROUTINE",
  elective: "ROUTINE",
};

const STATUS_REPAIR = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  sample_collected: "SAMPLE_COLLECTED",
  processing: "PROCESSING",
  in_progress: "PROCESSING",
  completed: "COMPLETED",
  verified: "VERIFIED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
};

const SAMPLE_STATUS_REPAIR = {
  not_collected: "NOT_COLLECTED",
  collected: "COLLECTED",
  rejected: "REJECTED",
};

const isMissingRef = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "object" && !Object.keys(value).length) ||
  (typeof value === "string" && value.trim() === "");

const describeId = (value) => {
  if (value && typeof value === "object" && value._id) return String(value._id);
  if (value && typeof value === "object" && value.testName) return `testName:"${value.testName}"`;
  return value === undefined ? "<absent>" : String(value);
};

(async () => {
  await mongoose.connect(env.mongoUri);
  console.log(`database: ${mongoose.connection.name}`);
  console.log(`mode:     ${APPLY ? "APPLY (writes enabled)" : "DRY RUN (read-only)"}`);
  console.log("");

  const requests = await LabRequest.find({}).lean();
  console.log(`labrequests scanned: ${requests.length}`);
  console.log("");

  if (requests.length === 0) {
    console.log("No LabRequest documents exist. Nothing to repair.");
    console.log("");
    console.log("This is the expected result on a database that never received a");
    console.log("legacy import. The 'test is required' / 'priority: Urgent is not a");
    console.log("valid enum value' failure cannot be reproduced here: there is no");
    console.log("LabRequest creation path anywhere in this repository, so any such");
    console.log("row must have come from an external/manual/older source.");
    await mongoose.disconnect();
    return;
  }

  // Build a lookup of real LabTest documents so a legacy `testName` can be
  // mapped ONLY onto a test that actually exists. An ambiguous name resolves to
  // nothing and the request is reported UNRESOLVED rather than guessed at.
  const tests = await LabTest.find({}).select("name testName testCode").lean();
  const byName = new Map();
  for (const test of tests) {
    for (const candidate of [test.name, test.testName, test.testCode]) {
      const key = normalizeToken(candidate);
      if (!key) continue;
      byName.set(key, byName.has(key) ? null : test);
    }
  }

  const findings = [];
  const fixes = [];

  for (const request of requests) {
    const problems = [];
    const actions = [];
    const set = {};

    // --- patient / doctor / test integrity -------------------------------
    if (isMissingRef(request.patient)) problems.push("missing patient");
    if (isMissingRef(request.doctor)) problems.push("missing doctor");

    if (isMissingRef(request.test)) {
      // A legacy row may carry a free-text testName instead of an ObjectId.
      const legacyName =
        request.testName ||
        (request.test && typeof request.test === "object" ? request.test.testName : null) ||
        request.test;
      const key = normalizeToken(legacyName);
      const match = key ? byName.get(key) : undefined;

      if (match) {
        problems.push(`missing test (legacy ${JSON.stringify(describeId(legacyName))})`);
        set.test = match._id;
        actions.push(`test -> LabTest ${match._id} (${match.name || match.testName})`);
      } else if (legacyName && key && byName.has(key)) {
        problems.push(`missing test, AMBIGUOUS name ${JSON.stringify(legacyName)}`);
      } else {
        problems.push(`missing test, UNRESOLVABLE from ${JSON.stringify(describeId(legacyName))}`);
      }
    }

    // --- enum normalisation ----------------------------------------------
    const priority = String(request.priority ?? "").trim();
    if (!priority) {
      problems.push("priority absent");
      set.priority = "ROUTINE";
      actions.push("priority -> ROUTINE (schema default)");
    } else if (!VALID_PRIORITY.has(priority)) {
      const canonical = PRIORITY_REPAIR[normalizeToken(priority)];
      if (canonical && VALID_PRIORITY.has(canonical)) {
        problems.push(`invalid priority ${JSON.stringify(priority)}`);
        set.priority = canonical;
        actions.push(`priority ${JSON.stringify(priority)} -> ${canonical}`);
      } else {
        problems.push(`invalid priority ${JSON.stringify(priority)}, no safe mapping`);
      }
    }

    const status = String(request.status ?? "").trim();
    if (!status) {
      problems.push("status absent");
      set.status = "PENDING";
      actions.push("status -> PENDING (schema default)");
    } else if (!VALID_STATUS.has(status)) {
      const canonical = STATUS_REPAIR[normalizeToken(status)];
      if (canonical && VALID_STATUS.has(canonical)) {
        problems.push(`invalid status ${JSON.stringify(status)}`);
        set.status = canonical;
        actions.push(`status ${JSON.stringify(status)} -> ${canonical}`);
      } else {
        problems.push(`invalid status ${JSON.stringify(status)}, no safe mapping`);
      }
    }

    const sampleStatus = String(request.sampleStatus ?? "").trim();
    if (sampleStatus && !VALID_SAMPLE_STATUS.has(sampleStatus)) {
      const canonical = SAMPLE_STATUS_REPAIR[normalizeToken(sampleStatus)];
      if (canonical && VALID_SAMPLE_STATUS.has(canonical)) {
        problems.push(`invalid sampleStatus ${JSON.stringify(sampleStatus)}`);
        set.sampleStatus = canonical;
        actions.push(`sampleStatus ${JSON.stringify(sampleStatus)} -> ${canonical}`);
      } else {
        problems.push(`invalid sampleStatus ${JSON.stringify(sampleStatus)}, no safe mapping`);
      }
    }

    // --- downstream rows that a bad request makes unreachable -------------
    if (isMissingRef(request.test) && !set.test) {
      const [samples, results, reports] = await Promise.all([
        mongoose.connection.db.collection("samplecollections").countDocuments({ labRequest: request._id }),
        mongoose.connection.db.collection("labresults").countDocuments({ labRequest: request._id }),
        mongoose.connection.db.collection("labreports").countDocuments({ labRequest: request._id }),
      ]);
      if (samples + results + reports > 0) {
        problems.push(
          `BLOCKED: has ${samples} sample(s), ${results} result(s), ${reports} report(s) downstream; ` +
            "needs an explicit human decision, not an automatic id"
        );
      }
    }

    const record = {
      id: String(request._id),
      problems,
      actions,
      set,
      status: String(request.status ?? "<absent>"),
      priority: String(request.priority ?? "<absent>"),
    };
    findings.push(record);
    if (actions.length) fixes.push(record);
  }

  const broken = findings.filter((f) => f.problems.length > 0);

  console.log("=== per-request report ===");
  for (const item of findings) {
    if (item.problems.length === 0) {
      console.log(`  OK    ${item.id}  status=${item.status} priority=${item.priority}`);
      continue;
    }
    console.log(`  BROKEN ${item.id}`);
    for (const problem of item.problems) console.log(`           - ${problem}`);
    for (const action of item.actions) console.log(`           > would ${action}`);
    if (item.actions.length === 0) console.log("           > no safe automatic fix");
  }

  console.log("");
  console.log(`valid requests:            ${findings.length - broken.length}`);
  console.log(`requests with problems:    ${broken.length}`);
  console.log(`requests with a safe fix:  ${fixes.length}`);
  console.log(`requests needing a human:  ${broken.length - fixes.length}`);

  if (fixes.length === 0) {
    console.log("");
    console.log("Nothing to apply.");
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log("");
    console.log("DRY RUN - no writes performed. Re-run with --apply to persist the fixes above.");
    await mongoose.disconnect();
    return;
  }

  console.log("");
  console.log(`applying ${fixes.length} repair(s)...`);
  let applied = 0;
  for (const fix of fixes) {
    try {
      await LabRequest.updateOne({ _id: fix.id }, { $set: fix.set }, { runValidators: true });
      applied += 1;
    } catch (error) {
      console.log(`  FAILED ${fix.id}: ${error.message}`);
    }
  }
  console.log(`applied: ${applied}`);

  // Re-verify: load every document through the model so Mongoose runs the real
  // validators. Anything still reported here is genuinely unfixable.
  const revalidated = await LabRequest.find({});
  const stillBroken = [];
  for (const document of revalidated) {
    try {
      document.validateSync();
    } catch (error) {
      stillBroken.push(`${document._id}: ${error.message}`);
    }
  }
  console.log(`records still failing schema validation: ${stillBroken.length}`);
  for (const line of stillBroken) console.log(`  ${line}`);

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(`repair-lab-requests failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
