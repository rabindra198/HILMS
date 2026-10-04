const mongoose = require("mongoose");

/**
 * Per-doctor notification preferences.
 *
 * Separate from `LabSettings` rather than a shared table with nullable columns,
 * because the two roles alert on disjoint events and a doctor should never be
 * able to write a laboratory preference (or the reverse). The unique index on
 * `user` is what makes the upsert in `doctorAccount.service` idempotent.
 */
const doctorSettingsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // New or changed appointments on the doctor's own list.
    appointmentAlerts: { type: Boolean, default: true },
    // A follow-up the doctor scheduled coming due.
    followUpAlerts: { type: Boolean, default: true },
    // A verified lab report becoming available to review.
    labReportAlerts: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DoctorSettings", doctorSettingsSchema);
