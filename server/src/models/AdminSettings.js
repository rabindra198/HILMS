const mongoose = require("mongoose");

/**
 * Per-admin notification and display preferences.
 *
 * Mirrors `DoctorSettings` / `LabSettings`: one collection per role rather than a
 * shared table with nullable columns, so an Admin can never write a laboratory
 * preference and vice versa. The unique index on `user` is what makes the upsert
 * in `admin.service` idempotent.
 */
const adminSettingsSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    // A Doctor / Laboratory access request awaiting review.
    accessRequestAlerts: { type: Boolean, default: true },
    // A new or changed appointment anywhere in the hospital.
    appointmentAlerts: { type: Boolean, default: true },
    // A patient registered or was updated by another staff member.
    patientAlerts: { type: Boolean, default: true },
    // A laboratory request needing administrative attention.
    laboratoryAlerts: { type: Boolean, default: true },
    // An invoice was issued, paid or voided.
    billingAlerts: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminSettings", adminSettingsSchema);