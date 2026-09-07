const mongoose = require("mongoose");

const labTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    sampleType: {
      type: String,
      enum: ["blood", "urine", "stool", "sputum", "swab", "tissue", "other"],
      required: true,
    },
    normalRange: { type: String, trim: true },
    unit: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabTest", labTestSchema);