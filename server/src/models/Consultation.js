const mongoose = require("mongoose");

/**
 * Consultation (SRS core entity - "Consultations"; FR-DR-02, FR-DR-08).
 *
 * One document per doctor-patient encounter. Vitals are captured inline as a
 * sub-document rather than in a separate VitalSign collection: they are only
 * ever read as part of the encounter, and a child collection would mean an
 * extra join on the single hottest read in the module (the consultation
 * workspace) for no query-shape benefit.
 *
 * The record is the anchor of the medical history. `prescriptions`,
 * `labRequests` and the follow-up booking are all referenced from here, so the
 * timeline is reconstructable from the consultation alone.
 */

const CONSULTATION_STATUSES = ["IN_PROGRESS", "COMPLETED", "CANCELLED"];

const VITAL_FLAGS = ["NORMAL", "ABNORMAL"];

const vitalsSchema = new mongoose.Schema(
  {
    bloodPressureSystolic: { type: Number, min: 40, max: 300 },
    bloodPressureDiastolic: { type: Number, min: 20, max: 200 },
    heartRate: { type: Number, min: 20, max: 250 },
    temperature: { type: Number, min: 30, max: 45 },
    respiratoryRate: { type: Number, min: 4, max: 80 },
    spo2: { type: Number, min: 50, max: 100 },
    weight: { type: Number, min: 0.5, max: 500 },
    height: { type: Number, min: 20, max: 260 },
    // BMI is derived, never trusted from the client, so the history cannot be
    // corrupted by a hand-edited payload.
    bmi: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
    // Whether the clinician flagged the vitals as abnormal at the time.
    flag: {
      type: String,
      enum: VITAL_FLAGS,
      default: "NORMAL",
    },
  },
  { _id: false }
);

const consultationSchema = new mongoose.Schema(
  {
    consultationNo: {
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
    // Optional: a consultation can be recorded outside a booked slot (walk-in,
    // or the doctor orders it from an existing lab report).
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
      index: true,
    },
    // FR-DR-02
    chiefComplaint: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    symptoms: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    clinicalNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    // FR-DR-02 - the diagnosis recorded for this encounter.
    diagnosis: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    treatmentPlan: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    // FR-DR-08 - the outcome of the episode of care this consultation opened.
    treatmentOutcome: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    // The doctor's private remark, kept separate from `clinicalNotes` so the
    // patient-facing history can exclude it later without a data migration.
    doctorNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    vitals: { type: vitalsSchema, default: null },
    status: {
      type: String,
      enum: CONSULTATION_STATUSES,
      default: "IN_PROGRESS",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    prescriptions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Prescription" },
    ],
    labRequests: [
      { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest" },
    ],
  },
  { timestamps: true }
);

// The consultation workspace and the history timeline both read
// "this doctor's consultations, newest first" and "this patient's history".
consultationSchema.index({ doctor: 1, createdAt: -1 });
consultationSchema.index({ patient: 1, createdAt: -1 });
consultationSchema.index({ doctor: 1, status: 1, createdAt: -1 });

/** Recomputes BMI from the stored height/weight. Returns null when unusable. */
consultationSchema.methods.computeBmi = function computeBmi() {
  const height = this.vitals?.height;
  const weight = this.vitals?.weight;
  if (!height || !weight) return null;
  const metres = height / 100;
  if (!metres) return null;
  return Math.round((weight / (metres * metres)) * 10) / 10;
};

module.exports = mongoose.model("Consultation", consultationSchema);
module.exports.CONSULTATION_STATUSES = CONSULTATION_STATUSES;
module.exports.VITAL_FLAGS = VITAL_FLAGS;
