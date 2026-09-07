import mongoose from "mongoose";

const labResultSchema = new mongoose.Schema(
  {
    test: { type: String, required: true },
    result: { type: String, default: "" },
    unit: { type: String, default: "" },
    referenceRange: { type: String, default: "" },
    flag: { type: String, enum: ["", "low", "high", "abnormal", "normal"], default: "" },
  },
  { _id: true }
);

const treatmentSchema = new mongoose.Schema(
  {
    clinicalInterpretation: { type: String, default: "" },
    treatmentDecision: { type: String, default: "" },
    updatedDiagnosis: { type: String, default: "" },
    additionalMedication: { type: String, default: "" },
    additionalNotes: { type: String, default: "" },
  },
  { _id: false }
);

const labReportSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LabRequest",
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DoctorProfile",
      required: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    testName: {
      type: String,
      required: true,
    },
    requestedDate: {
      type: String,
      default: "",
    },
    completedDate: {
      type: String,
      default: "",
    },
    results: {
      type: [labResultSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["Completed", "Verified"],
      default: "Completed",
    },
    comment: {
      type: String,
      default: "",
    },
    reviewed: {
      type: Boolean,
      default: false,
    },
    treatment: {
      type: treatmentSchema,
      default: {},
    },
  },
  { timestamps: true }
);

const LabReport = mongoose.model("LabReport", labReportSchema);

export default LabReport;
