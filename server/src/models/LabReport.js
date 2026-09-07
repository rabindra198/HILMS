const mongoose = require("mongoose");

const labReportSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    labTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LabTest",
      required: true,
    },
    orderedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    sampleCollectedAt: { type: Date },
    reportedAt: { type: Date },
    result: { type: String, trim: true },
    normalRange: { type: String, trim: true },
    unit: { type: String, trim: true },
    isAbnormal: { type: Boolean, default: false },
    remarks: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "sample_collected", "in_progress", "completed", "cancelled"],
      default: "pending",
    },
    attachmentUrl: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabReport", labReportSchema);