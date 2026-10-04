const mongoose = require("mongoose");

/**
 * Care-team assignment (section 25 authorisation scope).
 *
 * HILMS has no doctor<->patient relationship table, so before this existed a
 * doctor could open and order for every patient in the hospital by changing a
 * URL parameter. This model is that missing relationship.
 *
 * An assignment is created by an Admin (or seeded), and it is the *only* thing
 * that widens a doctor's patient list. A patient with no assignment is
 * invisible to the doctor module.
 */

const doctorPatientAssignmentSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Free text so a hospital can record why a pair is connected without
    // needing a Department model.
    relationship: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    // Audit trail for who granted access and when, so access review is possible.
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One live assignment per doctor/patient pair. The `revokedAt: null` partial
// filter is what makes revocation reversible without a second document.
doctorPatientAssignmentSchema.index(
  { doctor: 1, patient: 1 },
  {
    unique: true,
    partialFilterExpression: { revokedAt: null },
    name: "one_live_assignment_per_doctor_patient",
  }
);

doctorPatientAssignmentSchema.index({ patient: 1, revokedAt: 1 });

module.exports = mongoose.model("DoctorPatientAssignment", doctorPatientAssignmentSchema);
