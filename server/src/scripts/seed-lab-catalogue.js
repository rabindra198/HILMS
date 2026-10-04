require("dotenv").config();
const mongoose = require("mongoose");

const env = require("../config/env");
const LabTest = require("../models/LabTest");
const LabTestCategory = require("../models/LabTestCategory");
const LabRequest = require("../models/LabRequest");
const LabResult = require("../models/LabResult");
const LabReport = require("../models/LabReport");

/**
 * Seeds the laboratory test catalogue described by the SRS (FR-LB-06):
 *
 *   "Categories (examples: Hematology, Biochemistry, Microbiology, Imaging,
 *    Other configured categories)" and "Test reference ranges"
 *
 * This script exists because a test catalogue is reference data, not something
 * a technician should type. It is idempotent and safe to re-run:
 *
 *   - categories are upserted by slug, so renaming one keeps the same slug and
 *     the tests filed under it are unaffected
 *   - tests are upserted by testCode, the value the report and billing code
 *     already treat as the stable key
 *   - `categoryRef` is backfilled on every existing test, including rows written
 *     before categories became a collection, so nothing is orphaned
 *
 * Usage:
 *   node src/scripts/seed-lab-catalogue.js                    # dry run, prints the plan
 *   node src/scripts/seed-lab-catalogue.js --apply            # write to the configured DB
 *   node src/scripts/seed-lab-catalogue.js --apply --db=hilms_lab_dev
 *   node src/scripts/seed-lab-catalogue.js --apply --retire-residue
 */

const APPLY = process.argv.includes("--apply");
const RETIRE_RESIDUE = process.argv.includes("--retire-residue");
const dbArg = process.argv.find((arg) => arg.startsWith("--db="));
const DB_NAME = dbArg ? dbArg.split("=")[1] : undefined;

/**
 * Authoritative category list. `order` is the display order on the Tests screen.
 * "Haematology" uses the spelling already present in this database so the one
 * genuine seeded test (CBC) is not renamed out from under its reports.
 */
const CATEGORIES = [
  { name: "Haematology", description: "Blood cell counts, haemoglobin, platelets and blood grouping.", order: 1 },
  { name: "Biochemistry", description: "Chemistry assays: glucose, lipids, liver, kidney and thyroid profiles.", order: 2 },
  { name: "Microbiology", description: "Urine, stool, blood and sputum microbiology including culture and sensitivity.", order: 3 },
  { name: "Immunology", description: "Antibody, antigen and serological assays.", order: 4 },
  { name: "Histopathology", description: "Tissue processing, stains and biopsy reporting.", order: 5 },
  { name: "Imaging", description: "Diagnostic imaging reported by the radiology department: X-Ray, CT, MRI, ultrasound and ECG.", order: 6 },
  { name: "Other", description: "Tests that do not belong to a department yet.", order: 99 },
];

/**
 * Per-parameter helpers.
 *
 * `p()` is numeric: min/max drive the automatic HIGH/LOW flag.
 * `q()` is qualitative: no min/max, so nothing is flagged, and the text range is
 * what the technician compares against by eye.
 * `sx()` is numeric with a sex-specific override, used by the analytes whose
 * reference interval genuinely differs for male and female patients.
 */
const p = (parameter, unit, min, max, extra = {}) => ({ parameter, unit, min, max, isNumeric: true, ...extra });
const q = (parameter, referenceRangeText, extra = {}) => ({
  parameter,
  referenceRangeText,
  isNumeric: false,
  ...extra,
});
const sx = (parameter, unit, { male, female }, extra = {}) => ({
  parameter,
  unit,
  isNumeric: true,
  maleMin: male[0],
  maleMax: male[1],
  femaleMin: female[0],
  femaleMax: female[1],
  ...extra,
});

/**
 * The catalogue. Every numeric panel carries the parameters the report should
 * display, so a technician fills in values instead of retyping parameter names
 * and reference ranges on every request.
 */
const TESTS = [
  {
    name: "Complete Blood Count",
    testCode: "CBC",
    category: "Haematology",
    sampleType: "blood",
    price: 25,
    turnaroundTime: 6,
    description: "Full blood count with differential, indices and ESR.",
    parameters: [
      sx("Haemoglobin (Hb)", "g/dL", { male: [13.5, 17.5], female: [12.0, 15.5] }),
      sx("Total WBC Count", "/cumm", { male: [4000, 11000], female: [4000, 11000] }),
      p("Neutrophils", "%", 40, 75),
      p("Lymphocytes", "%", 20, 45),
      p("Monocytes", "%", 2, 10),
      p("Eosinophils", "%", 1, 6),
      sx("Platelet Count", "/cumm", { male: [150000, 410000], female: [150000, 410000] }),
      sx("Haematocrit (PCV)", "%", { male: [40, 52], female: [36, 48] }),
      sx("RBC Count", "million/cumm", { male: [4.5, 5.9], female: [4.1, 5.1] }),
      p("MCV", "fL", 80, 100),
      p("MCH", "pg", 27, 32),
      p("MCHC", "g/dL", 31.5, 34.5),
      sx("ESR", "mm in 1st hour", { male: [0, 15], female: [0, 20] }, { isRequired: false }),
    ],
  },
  {
    name: "Blood Sugar (Fasting)",
    testCode: "FBS",
    category: "Biochemistry",
    sampleType: "blood",
    price: 12,
    turnaroundTime: 4,
    description: "Plasma glucose after an overnight fast of at least 8 hours.",
    parameters: [p("Glucose (Fasting)", "mg/dL", 70, 100)],
  },
  {
    name: "Blood Sugar (Random)",
    testCode: "RBS",
    category: "Biochemistry",
    sampleType: "blood",
    price: 12,
    turnaroundTime: 4,
    description: "Plasma glucose at any time without fasting preparation.",
    parameters: [p("Glucose (Random)", "mg/dL", 70, 140)],
  },
  {
    name: "Glycated Haemoglobin (HbA1c)",
    testCode: "HBA1C",
    category: "Biochemistry",
    sampleType: "blood",
    price: 45,
    turnaroundTime: 24,
    description: "Three-month average blood glucose. Not affected by same-day intake.",
    parameters: [p("HbA1c", "%", 4, 5.6)],
  },
  {
    name: "Lipid Profile",
    testCode: "LIPID",
    category: "Biochemistry",
    sampleType: "blood",
    price: 30,
    turnaroundTime: 8,
    description: "Total cholesterol, triglycerides, HDL and LDL. Fasting preferred.",
    parameters: [
      p("Total Cholesterol (TC)", "mg/dL", 0, 200),
      p("Triglycerides (TG)", "mg/dL", 0, 150),
      p("HDL Cholesterol", "mg/dL", 40, 80),
      p("LDL Cholesterol", "mg/dL", 0, 100),
      p("VLDL Cholesterol", "mg/dL", 5, 40, { isRequired: false }),
      p("Total Cholesterol / HDL Ratio", "", 0, 4.5, { isRequired: false }),
    ],
  },
  {
    name: "Liver Function Test",
    testCode: "LFT",
    category: "Biochemistry",
    sampleType: "blood",
    price: 35,
    turnaroundTime: 8,
    description: "Liver enzymes, bilirubin and plasma proteins.",
    parameters: [
      p("Total Bilirubin", "mg/dL", 0.1, 1.2),
      p("Direct Bilirubin", "mg/dL", 0, 0.3, { isRequired: false }),
      p("SGPT / ALT", "U/L", 7, 56),
      p("SGOT / AST", "U/L", 10, 40),
      p("ALP", "U/L", 44, 147),
      p("Total Protein", "g/dL", 6.4, 8.3),
      p("Albumin", "g/dL", 3.5, 5.2),
      p("Globulin", "g/dL", 2, 3.5, { isRequired: false }),
    ],
  },
  {
    name: "Kidney Function Test",
    testCode: "KFT",
    category: "Biochemistry",
    sampleType: "blood",
    price: 35,
    turnaroundTime: 8,
    description: "Renal function: urea, creatinine, uric acid and estimated GFR.",
    parameters: [
      p("Blood Urea", "mg/dL", 15, 40),
      sx("Serum Creatinine", "mg/dL", { male: [0.7, 1.3], female: [0.6, 1.1] }),
      p("Blood Uric Acid", "mg/dL", 3.4, 7),
      p("Estimated GFR", "mL/min/1.73m2", 60, 150),
      p("Serum Sodium", "mEq/L", 136, 145, { isRequired: false }),
      p("Serum Potassium", "mEq/L", 3.5, 5.1, { isRequired: false }),
    ],
  },
  {
    name: "Thyroid Profile",
    testCode: "TFT",
    category: "Biochemistry",
    sampleType: "blood",
    price: 55,
    turnaroundTime: 24,
    description: "TSH with free T3 and free T4.",
    parameters: [
      p("TSH", "uIU/mL", 0.4, 4),
      p("Free T3", "pg/mL", 2.3, 4.2),
      p("Free T4", "ng/dL", 0.8, 1.8),
    ],
  },
  {
    name: "Blood Group and Rh Factor",
    testCode: "BLOODGRP",
    category: "Haematology",
    sampleType: "blood",
    price: 8,
    turnaroundTime: 2,
    description: "ABO grouping and Rh(D) typing by slide and tube method.",
    parameters: [
      q("ABO Group", "A, B, AB or O"),
      q("Rh Factor", "Positive (D+) or Negative (D-)"),
    ],
  },
  {
    name: "Erythrocyte Sedimentation Rate",
    testCode: "ESR",
    category: "Haematology",
    sampleType: "blood",
    price: 10,
    turnaroundTime: 2,
    description: "Westergren ESR, reported with the full blood count.",
    parameters: [sx("ESR", "mm in 1st hour", { male: [0, 15], female: [0, 20] })],
  },
  {
    name: "Urinalysis",
    testCode: "UA",
    category: "Microbiology",
    sampleType: "urine",
    price: 10,
    turnaroundTime: 3,
    description: "Routine urine examination by dipstick and microscopy.",
    parameters: [
      q("Colour", "Pale yellow to amber"),
      q("Appearance", "Clear"),
      p("pH", "", 5, 8),
      p("Specific Gravity", "", 1.005, 1.03, { isRequired: false }),
      q("Protein / Albumin", "Negative"),
      q("Glucose", "Negative"),
      q("Blood", "Negative"),
      q("Nitrite", "Negative"),
      p("Pus Cells", "/HPF", 0, 5),
      p("Epithelial Cells", "/HPF", 0, 5, { isRequired: false }),
      q("Bacteria", "Absent"),
      q("Casts", "Absent", { isRequired: false }),
      q("Crystals", "Absent", { isRequired: false }),
    ],
  },
  {
    name: "Urine Culture and Sensitivity",
    testCode: "UCS",
    category: "Microbiology",
    sampleType: "urine",
    price: 60,
    turnaroundTime: 72,
    description: "Urine culture on CLED agar with antibiotic sensitivity testing.",
    parameters: [
      q("Growth", "No growth after 48 hours"),
      q("Organism Isolated", "None"),
      q("Colony Count", "Not applicable"),
      q("Antibiotic Sensitivity", "Not applicable", { isRequired: false }),
    ],
  },
  {
    name: "Stool Examination",
    testCode: "STOOL",
    category: "Microbiology",
    sampleType: "stool",
    price: 12,
    turnaroundTime: 6,
    description: "Macroscopic and microscopic stool examination.",
    parameters: [
      q("Colour", "Brown"),
      q("Consistency", "Formed"),
      q("Mucus", "Absent"),
      q("Blood", "Absent"),
      q("Pus Cells", "Absent"),
      q("Ova / Cyst / Trophozoite", "Not seen"),
      q("Fat Globules", "Absent", { isRequired: false }),
    ],
  },
  {
    name: "Malaria Parasite",
    testCode: "MP",
    category: "Microbiology",
    sampleType: "blood",
    price: 8,
    turnaroundTime: 2,
    description: "Thick and thin film for malaria parasites, plus rapid antigen detection when requested.",
    parameters: [
      q("Plasmodium Species", "Not detected"),
      p("Parasitaemia", "%", 0, 0, { isRequired: false }),
    ],
  },
  {
    name: "Blood Culture and Sensitivity",
    testCode: "BCS",
    category: "Microbiology",
    sampleType: "blood",
    price: 80,
    turnaroundTime: 120,
    description: "Blood culture bottles incubated for up to five days with sensitivity.",
    parameters: [
      q("Growth", "No growth after 5 days"),
      q("Organism Isolated", "None"),
      q("Antibiotic Sensitivity", "Not applicable", { isRequired: false }),
    ],
  },
  {
    name: "Sputum Culture and Sensitivity",
    testCode: "SCS",
    category: "Microbiology",
    sampleType: "sputum",
    price: 70,
    turnaroundTime: 72,
    description: "Sputum culture for mycobacteria and routine organisms with sensitivity.",
    parameters: [
      q("Growth", "No growth after 72 hours"),
      q("Organism Isolated", "None"),
      q("Antibiotic Sensitivity", "Not applicable", { isRequired: false }),
    ],
  },
  {
    name: "Dengue NS1 Antigen",
    testCode: "DENGUE",
    category: "Immunology",
    sampleType: "blood",
    price: 40,
    turnaroundTime: 4,
    description: "NS1 antigen detection for dengue.",
    parameters: [q("Dengue NS1 Antigen", "Non-reactive")],
  },
  {
    name: "Widals Test",
    testCode: "WIDAL",
    category: "Immunology",
    sampleType: "blood",
    price: 25,
    turnaroundTime: 6,
    description: "Agglutination test for enteric fever.",
    parameters: [p("Widal Titre (TO)", "", 0, 80, { isRequired: false })],
  },
  {
    name: "C-Reactive Protein",
    testCode: "CRP",
    category: "Immunology",
    sampleType: "blood",
    price: 30,
    turnaroundTime: 6,
    description: "Quantitative C-reactive protein.",
    parameters: [p("CRP", "mg/L", 0, 6)],
  },
  {
    name: "Histopathology",
    testCode: "HISTO",
    category: "Histopathology",
    sampleType: "tissue",
    price: 300,
    turnaroundTime: 96,
    description: "Tissue processing, sectioning, staining and reporting.",
    resultStyle: "NARRATIVE",
    parameters: [q("Histopathological Findings", "Reported by the pathologist", { isRequired: false })],
  },
  {
    name: "Electrocardiogram (ECG)",
    testCode: "ECG",
    category: "Imaging",
    sampleType: "other",
    price: 50,
    turnaroundTime: 1,
    description: "Twelve-lead electrocardiogram with an interpretation.",
    resultStyle: "NARRATIVE",
    parameters: [q("ECG Findings", "Reported by the cardiologist", { isRequired: false })],
  },
  {
    name: "Chest X-Ray",
    testCode: "XRAY-CHEST",
    category: "Imaging",
    sampleType: "other",
    price: 120,
    turnaroundTime: 2,
    description: "PA and lateral chest radiograph.",
    resultStyle: "NARRATIVE",
    parameters: [q("Radiological Findings", "Reported by the radiologist", { isRequired: false })],
  },
  {
    name: "X-Ray",
    testCode: "XRAY",
    category: "Imaging",
    sampleType: "other",
    price: 120,
    turnaroundTime: 2,
    description: "Plain radiograph of the requested region.",
    resultStyle: "NARRATIVE",
    parameters: [q("Radiological Findings", "Reported by the radiologist", { isRequired: false })],
  },
  {
    name: "CT Scan",
    testCode: "CT",
    category: "Imaging",
    sampleType: "other",
    price: 2500,
    turnaroundTime: 24,
    description: "Computed tomography of the requested region with contrast as ordered.",
    resultStyle: "NARRATIVE",
    parameters: [q("CT Findings", "Reported by the radiologist", { isRequired: false })],
  },
  {
    name: "MRI",
    testCode: "MRI",
    category: "Imaging",
    sampleType: "other",
    price: 3500,
    turnaroundTime: 48,
    description: "Magnetic resonance imaging of the requested region.",
    resultStyle: "NARRATIVE",
    parameters: [q("MRI Findings", "Reported by the radiologist", { isRequired: false })],
  },
  {
    name: "Ultrasound",
    testCode: "USG",
    category: "Imaging",
    sampleType: "other",
    price: 900,
    turnaroundTime: 6,
    description: "Diagnostic ultrasound of the requested region.",
    resultStyle: "NARRATIVE",
    parameters: [q("Ultrasound Findings", "Reported by the sonographer", { isRequired: false })],
  },
];

/** Reports the plan without writing anything. Accepts a line or a list of lines. */
const report = (lines) =>
  (Array.isArray(lines) ? lines : [lines]).forEach((line) => console.log(line));

/**
 * Any ad-hoc category already in the database is given a real category row so no
 * test is left without a `categoryRef`. Without this, a test typed in by hand
 * under "ewrewr" would exist only as free text and would not appear in the
 * category filter at all.
 */
const reconcileCategories = async () => {
  const inUse = await LabTest.distinct("category");
  const added = [];

  for (const name of inUse) {
    const trimmed = String(name || "").trim();
    if (!trimmed) continue;
    const slug = LabTestCategory.slugify(trimmed);
    if (!slug) continue;

    // Case-insensitive match: the same category typed with different
    // capitalisation must not become a second row.
    const existing = await LabTestCategory.findOne({
      $or: [{ slug }, { name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }],
    }).lean();
    if (existing) continue;

    await LabTestCategory.create({
      name: trimmed,
      slug,
      description: "Category in use by existing tests, created automatically when the catalogue was seeded.",
      order: 98,
      isActive: true,
    });
    added.push(trimmed);
  }

  return added;
};

(async () => {
  // `--db` is passed to Mongoose as `dbName` rather than spliced into the URI
  // string, for the same reason seed-lab.js does it that way: MONGO_URI carries
  // no database segment, so string surgery on it silently writes to the shared
  // database. `dbName` cannot fail that way.
  await mongoose.connect(env.mongoUri, DB_NAME ? { dbName: DB_NAME } : {});
  const database = mongoose.connection.name;
  report([
    `database: ${database}`,
    `mode:     ${APPLY ? "APPLY (writes enabled)" : "DRY RUN"}`,
    "",
    `categories to ensure: ${CATEGORIES.length}`,
    `tests to ensure:      ${TESTS.length}`,
  ]);

  const parameterCount = TESTS.reduce((total, t) => total + (t.parameters?.length || 0), 0);
  report([`parameters in panels: ${parameterCount}`, ""]);

  const existingCodes = new Set(
    (await LabTest.find({ testCode: { $in: TESTS.map((t) => t.testCode) } }).select("testCode").lean()).map(
      (t) => t.testCode
    )
  );
  const newTests = TESTS.filter((t) => !existingCodes.has(t.testCode));
  report([
    `  new tests:     ${newTests.length}`,
    `  already there: ${TESTS.length - newTests.length}`,
    "",
    `existing tests in this database: ${await LabTest.countDocuments()}`,
  ]);

  if (RETIRE_RESIDUE) {
    // Two classes of leftover row, matched on purpose rather than by eyeballing
    // names, so this stays reproducible instead of a one-off manual edit:
    //
    //   1. tests that name themselves as test-run residue ("e2e")
    //   2. tests outside this catalogue that NOTHING references
    //
    // Class 2 is the safe one to act on automatically because the reference
    // check is the real guard: a test someone actually ordered has a LabRequest
    // pointing at it, so it can never be caught by this rule.
    const catalogueCodes = TESTS.map((t) => t.testCode);
    const outsideCatalogue = await LabTest.find({ testCode: { $nin: catalogueCodes }, isActive: true })
      .select("_id testCode name")
      .lean();

    const unreferenced = [];
    for (const t of outsideCatalogue) {
      const [requests, results, reports] = await Promise.all([
        LabRequest.countDocuments({ test: t._id }),
        LabResult.countDocuments({ test: t._id }),
        LabReport.countDocuments({ test: t._id }),
      ]);
      if (requests + results + reports === 0) unreferenced.push(t);
    }

    const namedResidue = await LabTest.find({
      $or: [{ testCode: { $regex: "e2e", $options: "i" } }, { name: { $regex: "e2e", $options: "i" } }],
    })
      .select("_id testCode name")
      .lean();

    // De-duplicate: a row can match both rules.
    const byId = new Map();
    for (const t of [...namedResidue, ...unreferenced]) byId.set(String(t._id), t);
    const residue = [...byId.values()];

    report([
      "",
      "residue match (--retire-residue):",
      `  self-declared test residue: ${namedResidue.length}`,
      `  unreferenced and outside catalogue: ${unreferenced.length}`,
      `  de-activating: ${residue.length}`,
      "  action: de-activate only. Rows are kept so historical reports still resolve,",
      "  and any test with a request/result/report is excluded by the reference check.",
    ]);
    if (residue.length <= 20) {
      residue.forEach((t) => report(`    - ${t.testCode || "(no code)"} | ${t.name}`));
    } else {
      report(`    (${residue.length} rows; run without --apply to see the full list)`);
    }
    report("");

    if (APPLY) {
      // Deactivate rather than delete: a historical report still points at its
      // test, and deleting the row would leave that report with a dangling
      // reference. Hidden from all pickers, still readable.
      const ids = residue.map((t) => t._id);
      if (ids.length) {
        await LabTest.updateMany({ _id: { $in: ids } }, { isActive: false });
        report(`  deactivated ${ids.length} tests (historical reports still resolve)`);

        // A category left with no active test is only clutter on the Tests screen.
        // Canonical categories are never retired even when they are empty - "Other"
        // is the catch-all and is expected to sit empty until a test needs it, and
        // the canonical upsert below runs after this block and would simply
        // re-activate anything it retired anyway.
        const canonicalNames = new Set(CATEGORIES.map((c) => c.name));
        const categories = await LabTestCategory.find().select("_id name").lean();
        for (const category of categories) {
          if (canonicalNames.has(category.name)) continue;
          const activeInCategory = await LabTest.countDocuments({
            categoryRef: category._id,
            isActive: true,
          });
          if (activeInCategory === 0) {
            await LabTestCategory.updateOne({ _id: category._id }, { isActive: false });
            report(`  retired empty category: ${category.name}`);
          }
        }
      }
    }
  }

  if (!APPLY) {
    report(["DRY RUN - nothing written. Re-run with --apply to seed."]);
    await mongoose.disconnect();
    return;
  }

  if (database === "test" && !DB_NAME) {
    report(["NOTE: writing to the shared 'test' database. Pass --db=<name> to seed a scratch database instead.", ""]);
  }

  // Categories first, so every test written below can carry a real `categoryRef`.
  const categoryIds = new Map();
  for (const category of CATEGORIES) {
    const slug = LabTestCategory.slugify(category.name);
    const doc = await LabTestCategory.findOneAndUpdate(
      { slug },
      { $set: { ...category, slug, isActive: category.isActive !== false } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    categoryIds.set(doc.name, doc._id);
  }
  report(`ensured ${categoryIds.size} canonical categories`);

  const reconciled = await reconcileCategories();
  if (reconciled.length) report(`reconciled in-use categories: ${reconciled.join(", ")}`);

  // Re-read: reconciliation may have added rows, and tests must resolve against
  // the final set of categories.
  const allCategories = await LabTestCategory.find().select("name _id").lean();
  const byName = new Map(allCategories.map((c) => [c.name, c._id]));

  let created = 0;
  let updated = 0;

  for (const test of TESTS) {
    const categoryRef = byName.get(test.category);
    if (!categoryRef) {
      // A catalogue entry with no category would fail the schema's required
      // `category`, so fail loudly rather than write a half-correct row.
      throw new Error(`Catalogue test ${test.testCode} references unknown category "${test.category}"`);
    }

    // Parameters carry an explicit sortOrder so the result-entry form and the
    // report render in panel order rather than depending on insertion order.
    const parameters = (test.parameters || []).map((parameter, index) => ({
      ...parameter,
      sortOrder: index,
    }));

    const set = {
      name: test.name,
      category: test.category,
      categoryRef,
      sampleType: test.sampleType,
      price: test.price,
      turnaroundTime: test.turnaroundTime,
      description: test.description,
      parameters,
      resultStyle: test.resultStyle || "PANEL",
      isActive: true,
    };

    // Existence is checked before the write rather than inferred from
    // createdAt/updatedAt after it, which is unreliable at second resolution.
    const alreadyThere = await LabTest.exists({ testCode: test.testCode });
    await LabTest.findOneAndUpdate({ testCode: test.testCode }, { $set: set }, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });
    if (alreadyThere) updated += 1;
    else created += 1;
  }

  // Backfill `categoryRef` for tests this catalogue does not own, including
  // residue rows, so the category filter and the Tests screen group correctly.
  let backfilled = 0;
  for (const doc of await LabTest.find({ categoryRef: { $exists: false } }).select("_id category")) {
    const categoryRef = byName.get(doc.category);
    if (!categoryRef) continue;
    await LabTest.updateOne({ _id: doc._id }, { $set: { categoryRef } });
    backfilled += 1;
  }
  if (backfilled) report(`backfilled categoryRef on ${backfilled} pre-existing tests`);

  report("");
  report(`tests written: ${created} created, ${updated} updated`);
  report(`total tests now: ${await LabTest.countDocuments()}`);
  report(`active tests:    ${await LabTest.countDocuments({ isActive: true })}`);

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
