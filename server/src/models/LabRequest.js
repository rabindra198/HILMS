import mongoose from "mongoose";

const LAB_TESTS = Object.freeze([
  "CBC",
  "Blood Sugar",
  "Urine",
  "Stool",
  "Liver Function",
  "Kidney Function",
  "Lipid Profile",
  "Thyroid Profile",
  "ECG",
  "X-Ray",
  "CT Scan",
  "MRI",
  "Ultrasound",
]);

const labRequestSchema = new mongoose.Schema(
  {
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
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    testName: {
      type: String,
      required: true,
      enum: LAB_TESTS,
    },
    clinicalNotes: {
      type: String,
      default: "",
    },
    priority: {
      type: String,
      enum: ["Normal", "Urgent", "Emergency"],
      default: "Normal",
    },
    requestedDate: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10),
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed", "Cancelled"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

const LabRequest = mongoose.model("LabRequest", labRequestSchema);

export { LAB_TESTS };
export default LabRequest;
