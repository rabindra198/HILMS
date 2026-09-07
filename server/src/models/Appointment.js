import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
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
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      default: "General Consultation",
    },
    status: {
      type: String,
      enum: ["Waiting", "In Consultation", "Completed", "Cancelled", "Scheduled"],
      default: "Waiting",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
