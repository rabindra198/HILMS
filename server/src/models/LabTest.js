const mongoose = require("mongoose");

/**
 * One measured analyte of a test (SRS FR-LB-04 "record reference values",
 * FR-LB-06 "test reference ranges").
 *
 * A test's reference range is per parameter, never per test. "Complete Blood
 * Count" has no single normal range - it has a range for haemoglobin, a
 * different one for white cell count, and for several of them a different range
 * for male and female patients. Storing that as one flat string (which is what
 * `normalRange` is, kept for compatibility with rows seeded before this
 * schema) means the technician has to retype the range on every result.
 */
const parameterSchema = new mongoose.Schema(
  {
    parameter: { type: String, required: true, trim: true },
    unit: { type: String, trim: true },
    // Numeric bounds drive the HIGH/LOW flag automatically; `referenceRangeText`
    // carries any range that cannot be expressed as two numbers (a ratio, a
    // negative-only range, a "negative" qualitative result).
    min: { type: Number },
    max: { type: Number },
    referenceRangeText: { type: String, trim: true },
    // Sex-specific override. Absent means the parameter is the same for all
    // patients. Used by haemoglobin, haematocrit, RBC and similar analytes.
    maleMin: { type: Number },
    maleMax: { type: Number },
    femaleMin: { type: Number },
    femaleMax: { type: Number },
    // A required parameter must be given a value before processing can be
    // completed. Optional ones stay available for the technician to add when a
    // test has an extended panel.
    isRequired: { type: Boolean, default: true },
    // Numeric analytes are compared against min/max; qualitative ones are not.
    isNumeric: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

const labTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    testName: { type: String, trim: true },
    testCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true, index: true },
    // Free text, kept so existing rows and reports keep rendering. The
    // authoritative list of categories is the LabTestCategory collection; this
    // is the name of the category a test is filed under.
    category: { type: String, required: true, trim: true },
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: "LabTestCategory" },
    description: { type: String, trim: true },
    sampleType: {
      type: String,
      enum: ["blood", "urine", "stool", "sputum", "swab", "tissue", "other"],
      required: true,
    },
    normalRange: { type: String, trim: true },
    referenceRanges: [{ type: String, trim: true }],
    normalValues: { type: String, trim: true },
    turnaroundTime: { type: Number, min: 0 },
    unit: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    // Analytes measured by this test, with their reference ranges. This is what
    // drives the result-entry form; the technician fills in values rather than
    // retyping parameter names and ranges.
    parameters: { type: [parameterSchema], default: [] },
    // Imaging-style tests (X-Ray, CT, MRI, Ultrasound) have no numeric analyte
    // panel; the report carries a free-text finding instead.
    resultStyle: { type: String, enum: ["PANEL", "NARRATIVE"], default: "PANEL" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

labTestSchema.index({ category: 1, name: 1 });
labTestSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model("LabTest", labTestSchema);
