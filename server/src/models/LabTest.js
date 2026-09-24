const mongoose = require("mongoose");

const labTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    testName: { type: String, trim: true },
    testCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true, index: true },
    category: { type: String, required: true, trim: true },
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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabTest", labTestSchema);