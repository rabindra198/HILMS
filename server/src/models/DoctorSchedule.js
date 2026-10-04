const mongoose = require("mongoose");

/**
 * A doctor is only bookable inside a window the Admin has published.
 *
 * WHY this collection exists: `patient.service.listAvailability` used to invent a
 * flat 09:00-17:00 clinic window for every doctor from a module-level constant.
 * That is not availability, it is a placeholder - it cannot express that one
 * doctor works mornings only, or that Saturday is closed. FR-AD-04 requires the
 * Admin to manage doctor availability and appointment slots, so the window has to
 * be real data the Admin writes and every booking path reads.
 *
 * A doctor may have several windows on the same weekday (morning + evening
 * clinic), so the compound index is deliberately not unique. A doctor with no
 * rows keeps the historical 09:00-17:00 behaviour via the fallback in
 * `schedule.service`, so existing accounts and existing bookings stay valid.
 */
const doctorScheduleSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // 0 = Sunday .. 6 = Saturday, matching `Date.prototype.getDay()` so a window
    // is looked up from a date without a conversion table.
    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
      validate: {
        validator: Number.isInteger,
        message: "Weekday must be a whole number between 0 (Sunday) and 6 (Saturday)",
      },
    },
    startMinutes: { type: Number, required: true, min: 0, max: 1439 },
    endMinutes: { type: Number, required: true, min: 1, max: 1440 },
    slotMinutes: { type: Number, default: 30, min: 5, max: 240 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One lookup per doctor per weekday when the booking path validates a slot.
doctorScheduleSchema.index({ doctor: 1, weekday: 1 }, { name: "availability_by_weekday" });
doctorScheduleSchema.index({ doctor: 1, isActive: 1 });

module.exports = mongoose.model("DoctorSchedule", doctorScheduleSchema);