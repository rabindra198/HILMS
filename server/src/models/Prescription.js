const mongoose = require("mongoose");

/**
 * Prescription (SRS core entities - "Prescriptions", "Prescription Items";
 * FR-DR-03, FR-DR-04).
 *
 * Items are embedded rather than a separate collection: a prescription is
 * always read and printed in full, never queried across rows, and the document
 * is immutable once completed. That keeps the printable artefact a single read
 * with no join, which matters for the print/PDF path.
 */

const FREQUENCIES = [
  "ONCE_DAILY",
  "TWICE_DAILY",
  "THREE_TIMES_DAILY",
  "FOUR_TIMES_DAILY",
  "EVERY_8_HOURS",
  "EVERY_6_HOURS",
  "AS_NEEDED",
  "AT_BEDTIME",
  "BEFORE_MEALS",
  "AFTER_MEALS",
];

const ROUTES = ["ORAL", "TOPICAL", "INHALATION", "INJECTION", "RECTAL", "EYE", "EAR", "OTHER"];

const PRESCRIPTION_STATUSES = ["DRAFT", "ISSUED", "CANCELLED"];

const prescriptionItemSchema = new mongoose.Schema(
  {
    medicine: {
      type: String,
      required: [true, "Medicine name is required"],
      trim: true,
      maxlength: 200,
    },
    // Free text rather than a Medicine collection: HILMS has no pharmacy
    // catalogue, and inventing one would be a module the SRS never asked for.
    dosage: {
      type: String,
      required: [true, "Dosage is required"],
      trim: true,
      maxlength: 200,
    },
    frequency: {
      type: String,
      enum: FREQUENCIES,
      default: "ONCE_DAILY",
    },
    duration: {
      type: String,
      required: [true, "Duration is required"],
      trim: true,
      maxlength: 100,
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    route: {
      type: String,
      enum: ROUTES,
      default: "ORAL",
    },
    quantity: {
      type: Number,
      min: 0,
      // Absent on a PRN ("as needed") line, so it is optional by design.
    },
  },
  { _id: true }
);

const prescriptionSchema = new mongoose.Schema(
  {
    prescriptionNo: {
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
    consultation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consultation",
      index: true,
    },
    items: {
      type: [prescriptionItemSchema],
      required: true,
      // A prescription with no medicines is not a prescription.
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "A prescription must contain at least one medicine",
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    // FR-DR-09 - the follow-up date printed at the foot of the prescription.
    followUpDate: { type: Date },
    // Once issued the clinical content is frozen: editing a prescription that a
    // patient may already have filled is a safety problem, not a UX nicety.
    // A correction is a new prescription that references this one.
    status: {
      type: String,
      enum: PRESCRIPTION_STATUSES,
      default: "ISSUED",
      index: true,
    },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

prescriptionSchema.index({ doctor: 1, createdAt: -1 });
prescriptionSchema.index({ patient: 1, createdAt: -1 });

/** Total dispensed units across every line, for the printed summary. */
prescriptionSchema.methods.totalQuantity = function totalQuantity() {
  return (this.items || []).reduce(
    (sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0
  );
};

module.exports = mongoose.model("Prescription", prescriptionSchema);
module.exports.FREQUENCIES = FREQUENCIES;
module.exports.ROUTES = ROUTES;
module.exports.PRESCRIPTION_STATUSES = PRESCRIPTION_STATUSES;
