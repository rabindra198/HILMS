const mongoose = require("mongoose");

const sampleCollectionSchema = new mongoose.Schema({
  sampleId: { type: String, required: true, unique: true, index: true },
  labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest", required: true, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
  sampleType: { type: String, required: true, trim: true },
  collectionDate: { type: Date, required: true, default: Date.now },
  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["COLLECTED", "REJECTED", "RECEIVED"], default: "COLLECTED" },
  barcode: { type: String, unique: true, sparse: true, index: true },
  notes: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.model("SampleCollection", sampleCollectionSchema);
