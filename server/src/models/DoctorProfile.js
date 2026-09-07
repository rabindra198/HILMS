import mongoose from "mongoose";

const notificationPrefsSchema = new mongoose.Schema(
  {
    appointmentReminders: { type: Boolean, default: true },
    labReportAlerts: { type: Boolean, default: true },
    followUpReminders: { type: Boolean, default: true },
    newPatientAlerts: { type: Boolean, default: false },
    systemMaintenance: { type: Boolean, default: true },
  },
  { _id: false }
);

const clinicalPrefsSchema = new mongoose.Schema(
  {
    consultationDuration: { type: String, default: "30 minutes" },
    followUpPeriod: { type: String, default: "2 weeks" },
    labReportPriority: { type: String, default: "Normal" },
    prescriptionTemplate: { type: String, default: "Standard" },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    notifications: { type: notificationPrefsSchema, default: {} },
    clinical: { type: clinicalPrefsSchema, default: {} },
    theme: { type: String, default: "Light" },
  },
  { _id: false }
);

const doctorProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    specialization: {
      type: String,
      trim: true,
      default: "",
    },
    licenseNumber: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    workingHours: {
      start: { type: String, default: "09:00" },
      end: { type: String, default: "17:00" },
    },
    bio: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    settings: {
      type: settingsSchema,
      default: {},
    },
  },
  { timestamps: true }
);

const DoctorProfile = mongoose.model("DoctorProfile", doctorProfileSchema);

export default DoctorProfile;
