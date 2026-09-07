const mongoose = require("mongoose");

const labRequestSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
    priority: { type: String, enum: ["routine", "urgent", "stat"], default: "routine" },
    clinicalNotes: { type: String, trim: true },
    requestedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "sample_collected", "processing", "completed", "cancelled"],
      default: "pending",
    },
    sampleStatus: {
      type: String,
      enum: ["not_collected", "collected", "rejected"],
      default: "not_collected",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabRequest", labRequestSchema);