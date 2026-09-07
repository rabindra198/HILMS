import mongoose from "mongoose";
import Counter from "./Counter.js";

const patientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: [true, "Please enter the patient name"],
      trim: true,
    },
    patientId: {
      type: String,
      unique: true,
      trim: true,
    },
    age: {
      type: Number,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
    bloodGroup: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    allergies: {
      type: [String],
      default: [],
    },
    conditions: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

patientSchema.pre("save", async function (next) {
  if (!this.patientId) {
    const counter = await mongoose.model("PatientCounter").findOneAndUpdate(
      { name: "patientId" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.patientId = `PAT-${String(counter.seq + 1000).padStart(4, "0")}`;
  }
  next();
});

const Patient = mongoose.model("Patient", patientSchema);

export default Patient;
