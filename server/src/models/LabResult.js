const mongoose = require("mongoose");

const resultParameterSchema = new mongoose.Schema({
  parameter: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
  unit: { type: String, trim: true },
  referenceRange: { type: String, trim: true },
  flag: { type: String, enum: ["NORMAL", "HIGH", "LOW", "CRITICAL", "ABNORMAL"], default: "NORMAL" },
  remarks: { type: String, trim: true },
}, { _id: false });

const labResultSchema = new mongoose.Schema({
  labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest", required: true, index: true },
  sample: { type: mongoose.Schema.Types.ObjectId, ref: "SampleCollection", required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
  parameters: { type: [resultParameterSchema], required: true, validate: (items) => items.length > 0 },
  attachments: [{ type: String, trim: true }],
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  enteredAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("LabResult", labResultSchema);
