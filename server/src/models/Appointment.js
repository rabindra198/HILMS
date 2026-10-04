const mongoose = require("mongoose");
const { ROLES, ROLE_VALUES } = require("../config/roles");

/**
 * Appointment (SRS core entity - "Appointments", "Doctor Schedules").
 *
 * A single collection serves every visit, and `type` distinguishes the reason
 * for the visit rather than duplicating the concept into a separate follow-up
 * table (FR-DR-09). `followUpOf` links a follow-up back to the consultation that
 * prompted it, which is what makes the medical-history timeline traversable
 * backwards: consultation -> follow-up appointment -> next consultation.
 */

const APPOINTMENT_TYPES = ["CONSULTATION", "FOLLOW_UP", "REPORT_REVIEW", "PROCEDURE"];

const APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW"];

const appointmentSchema = new mongoose.Schema(
  {
    // Human-facing sequential reference (APT-YYYY-NNNN), generated server-side
    // by utils/sequence so it can be quoted in the UI without leaking _id.
    appointmentNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    appointmentDate: {
      type: Date,
      required: [true, "Appointment date is required"],
      index: true,
    },
    // Stored as minutes-from-midnight so a booking can never depend on how the
    // server's timezone formats a "09:00" string.
    startMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 1439,
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 5,
      max: 480,
    },
    type: {
      type: String,
      enum: APPOINTMENT_TYPES,
      default: "CONSULTATION",
    },
    status: {
      type: String,
      enum: APPOINTMENT_STATUSES,
      default: "SCHEDULED",
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    // Set only on FOLLOW_UP bookings; points at the consultation that
    // recommended the visit so the history timeline can walk the chain.
    followUpOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledReason: {
      type: String,
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true }
);

// A doctor's day view is always "my appointments for this date", so the
// compound index matches that query exactly.
appointmentSchema.index({ doctor: 1, appointmentDate: 1, startMinutes: 1 });
// Patient-facing history list.
appointmentSchema.index({ patient: 1, appointmentDate: -1 });
// Dashboard follow-up panel scans a doctor\'s upcoming FOLLOW_UP bookings.
appointmentSchema.index({ doctor: 1, type: 1, appointmentDate: 1 });

/** Minutes-from-midnight -> "09:30". */
appointmentSchema.methods.toTimeLabel = function toTimeLabel() {
  const hours = Math.floor(this.startMinutes / 60);
  const minutes = this.startMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

module.exports = mongoose.model("Appointment", appointmentSchema);
module.exports.APPOINTMENT_TYPES = APPOINTMENT_TYPES;
module.exports.APPOINTMENT_STATUSES = APPOINTMENT_STATUSES;
module.exports.ROLES = ROLES;
module.exports.ROLE_VALUES = ROLE_VALUES;
