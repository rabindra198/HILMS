const mongoose = require("mongoose");

const labReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest", required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
    sample: { type: mongoose.Schema.Types.ObjectId, ref: "SampleCollection", required: true },
    results: [{ type: mongoose.Schema.Types.ObjectId, ref: "LabResult" }],
    remarks: { type: String, trim: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    generatedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date },
    status: { type: String, enum: ["DRAFT", "COMPLETED", "VERIFIED"], default: "DRAFT" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LabReport", labReportSchema);