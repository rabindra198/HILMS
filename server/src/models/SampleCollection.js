const mongoose = require("mongoose");

// Mirrors LabTest.sampleType. A sample must be one of the specimen types the
// catalogue actually supports; validated again in the service so a hand-inserted
// document cannot introduce a value the UI cannot render.
const SAMPLE_TYPES = ["blood", "urine", "stool", "sputum", "swab", "tissue", "other"];

const sampleCollectionSchema = new mongoose.Schema({
  sampleId: { type: String, required: true, unique: true, index: true },
  labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest", required: true, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
  sampleType: { type: String, required: true, trim: true, lowercase: true, enum: SAMPLE_TYPES },
  collectionDate: { type: Date, required: true, default: Date.now },
  // SRS FR-LB-03 lists collection date AND time. Kept separate from
  // `collectionDate` so a report can print the exact draw time.
  collectionTime: { type: Date },
  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["COLLECTED", "REJECTED", "RECEIVED"], default: "COLLECTED" },
  // Generated server-side from sampleId. A client-supplied barcode is ignored:
  // the identifier has to be trustworthy, so it is never taken from the request
  // body. Both fields carry no patient identity (SRS FR-LB-03) - they resolve
  // back to the sample through the database, not by decoding a name off the tube.
  barcode: { type: String, unique: true, sparse: true, index: true },
  // Payload encoded by the printed QR code. Kept so a label reprinted later
  // reproduces the exact same code, and so a scanned label can be integrity
  // checked before a result is filed against the specimen.
  qrPayload: { type: String, index: true },
  // Set when the code was scanned at specimen receipt, for chain-of-custody.
  receivedAt: { type: Date },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes: { type: String, trim: true },
}, { timestamps: true });

sampleCollectionSchema.index({ labRequest: 1, patient: 1, status: 1 });

module.exports = mongoose.model("SampleCollection", sampleCollectionSchema);
module.exports.SAMPLE_TYPES = SAMPLE_TYPES;
