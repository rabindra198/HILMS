const mongoose = require("mongoose");

const labRequestSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    // The consultation that prompted the order. This is the back-link to
    // `Consultation.labRequests`, so "which test did this consultation order?" is
    // answerable from either side without a scan.
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
    priority: { type: String, enum: ["ROUTINE", "URGENT", "STAT", "routine", "urgent", "stat"], default: "ROUTINE" },
    clinicalNotes: { type: String, trim: true },
    requestedDate: { type: Date, default: Date.now },
    /**
     * The price of `test` at the moment the doctor ordered it (SRS: the price
     * must come from the laboratory test configuration).
     *
     * Billing reads the live LabTest.price, so without this snapshot a catalogue
     * reprice would silently change what an already-completed test is said to
     * cost on a patient's unpaid-charge list.
     */
    priceSnapshot: { type: Number, min: 0 },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED", "CANCELLED", "pending", "sample_collected", "processing", "completed", "cancelled"],
      default: "PENDING",
    },
    sampleStatus: {
      type: String,
      enum: ["NOT_COLLECTED", "COLLECTED", "REJECTED", "not_collected", "collected", "rejected"],
      default: "NOT_COLLECTED",
    },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acceptedAt: { type: Date },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    collectedAt: { type: Date },
    /**
     * Who STARTED the bench work, as opposed to `processedBy` which records who
     * finished it. Previously only the completing technician was attributable.
     */
    processingStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processingStartedAt: { type: Date },
    processingCompletedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processingNotes: { type: String, trim: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    // Cancellation is reachable from PENDING and ACCEPTED but, until these
    // fields existed, nothing recorded who cancelled a test or why - the most
    // consequential transition in the workflow had the weakest audit trail.
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true, maxlength: 1000 },
    /**
     * Append-only transition trail, so the document can reconstruct its own
     * history rather than depending on a separate audit collection.
     */
    statusHistory: [
      {
        _id: false,
        from: { type: String, trim: true },
        to: { type: String, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
        note: { type: String, trim: true, maxlength: 500 },
      },
    ],
  },
  { timestamps: true }
);

// Compound indexes for the queries the laboratory module actually runs.
// The dashboard counts three times on `status`; the request list sorts by
// `createdAt`; every patient-scoped lookup filters `patient`. Without these,
// each of those is a collection scan.
//
// Applied by `npm run sync:indexes` rather than automatically, so index
// creation on a large collection is an explicit, observable operation.
labRequestSchema.index({ status: 1, createdAt: -1 });
labRequestSchema.index({ patient: 1, createdAt: -1 });
labRequestSchema.index({ doctor: 1, createdAt: -1 });
labRequestSchema.index({ priority: 1, status: 1 });
labRequestSchema.index({ test: 1, status: 1 });
labRequestSchema.index({ requestedDate: -1 });
labRequestSchema.index({ consultation: 1 });

module.exports = mongoose.model("LabRequest", labRequestSchema);