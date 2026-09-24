const mongoose = require("mongoose");

const labRequestSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
    priority: { type: String, enum: ["ROUTINE", "URGENT", "STAT", "routine", "urgent", "stat"], default: "ROUTINE" },
    clinicalNotes: { type: String, trim: true },
    requestedDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED", "CANCELLED", "pending", "sample_collected", "processing", "completed", "cancelled"],
      default: "PENDING",
    },
    sampleStatus: {
      type: String,
      enum: ["NOT_COLLECTED", "COLLECTED", "REJECTED", "not_collected", "collected", "rejected"],
      default: "NOT_COLLECTED",
    },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acceptedAt: { type: Date },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processingStartedAt: { type: Date },
    processingCompletedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processingNotes: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabRequest", labRequestSchema);