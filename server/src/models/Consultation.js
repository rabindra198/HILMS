import mongoose from "mongoose";

const vitalSignsSchema = new mongoose.Schema(
  {
    bloodPressure: { type: String, default: "" },
    heartRate: { type: Number, default: null },
    temperature: { type: Number, default: null },
    respiratoryRate: { type: Number, default: null },
    oxygenSaturation: { type: Number, default: null },
    weight: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false }
);

const consultationSchema = new mongoose.Schema(
  {
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
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
    chiefComplaint: {
      type: String,
      default: "",
    },
    clinicalNotes: {
      type: String,
      default: "",
    },
    diagnosis: {
      type: String,
      default: "",
    },
    treatmentPlan: {
      type: String,
      default: "",
    },
    additionalNotes: {
      type: String,
      default: "",
    },
    vitalSigns: {
      type: vitalSignsSchema,
      default: {},
    },
    status: {
      type: String,
      enum: ["Draft", "Completed"],
      default: "Draft",
    },
    followUp: {
      date: { type: String, default: "" },
      time: { type: String, default: "" },
      reason: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

const Consultation = mongoose.model("Consultation", consultationSchema);

export default Consultation;
