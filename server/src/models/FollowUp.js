import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
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
    consultation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Upcoming", "Completed", "Cancelled"],
      default: "Upcoming",
    },
  },
  { timestamps: true }
);

const FollowUp = mongoose.model("FollowUp", followUpSchema);

export default FollowUp;
