const mongoose = require("mongoose");

const resultParameterSchema = new mongoose.Schema({
  parameter: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
  unit: { type: String, trim: true },
  referenceRange: { type: String, trim: true },
  flag: { type: String, enum: ["NORMAL", "HIGH", "LOW", "CRITICAL", "ABNORMAL"], default: "NORMAL" },
  remarks: { type: String, trim: true },
  /**
   * The ObjectId of the entry inside `LabTest.parameters` that this result
   * parameter was recorded against (SRS FR-LB-04/06: the same catalogue entry
   * defines the parameter and the reference range it was recorded against).
   *
   * Stored on the result so completion validation can match by stable id
   * instead of relying on display-name string equality, which the Processing
   * form used to let the user rename. Absent on rows written before this field
   * existed; those are matched by normalized name as a backward-compatible
   * fallback.
   */
  parameterId: { type: mongoose.Schema.Types.ObjectId },
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  // Random token used as the on-disk filename. This is the only identifier the
  // client ever receives - never a filesystem path.
  id: { type: String, required: true },
  fileName: { type: String, trim: true },
  mimeType: { type: String, trim: true },
  size: { type: Number, min: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const labResultSchema = new mongoose.Schema({
  labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest", required: true, index: true },
  sample: { type: mongoose.Schema.Types.ObjectId, ref: "SampleCollection", required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
  parameters: { type: [resultParameterSchema], required: true, validate: (items) => items.length > 0 },
  attachments: { type: [attachmentSchema], default: [] },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  enteredAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

labResultSchema.index({ labRequest: 1, patient: 1, test: 1 });

module.exports = mongoose.model("LabResult", labResultSchema);
