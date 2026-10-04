const mongoose = require("mongoose");

const labReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    // Not unique: a corrected report is issued as a new revision of the same
    // request rather than by overwriting the released one. The service enforces
    // "one live (non-superseded) report per request", which a unique index
    // cannot express.
    labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
    sample: { type: mongoose.Schema.Types.ObjectId, ref: "SampleCollection", required: true },
    results: [{ type: mongoose.Schema.Types.ObjectId, ref: "LabResult" }],
    remarks: { type: String, trim: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    generatedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date },
    /**
     * SRS FR-LB-05: "generate, verify, and approve".
     *
     * COMPLETED - report generated, results attached, awaiting review.
     * VERIFIED  - a second pair of eyes has checked the results, the reference
     *             ranges and the attachments, and released the report to the
     *             requesting doctor.
     * APPROVED  - final sign-off. This is the state that makes the report an
     *             immutable clinical document: results behind it are frozen and
     *             a correction has to be issued as a new revision.
     * SUPERSEDED - replaced by a later revision. Kept in the collection rather
     *             than deleted so the history a doctor read is still auditable.
     */
    status: { type: String, enum: ["DRAFT", "COMPLETED", "VERIFIED", "APPROVED", "SUPERSEDED"], default: "DRAFT" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    /** 1 for an original report, 2+ for each correction of it. */
    revision: { type: Number, default: 1, min: 1 },
    /** The report this one corrects, for SUPERSEDED -> APPROVED chains. */
    amends: { type: mongoose.Schema.Types.ObjectId, ref: "LabReport" },
    /** Why a revision was raised. Required when amending a released report. */
    amendmentReason: { type: String, trim: true, maxlength: 1000 },
    /** Checkbox attestations captured at verification (SRS report review). */
    verificationChecks: {
      resultsChecked: { type: Boolean, default: false },
      referenceRangesChecked: { type: Boolean, default: false },
      attachmentsChecked: { type: Boolean, default: false },
    },

    /**
     * FR-DR-07 "add comments" - the reviewing Doctor's clinical interpretation.
     *
     * Append-only and deliberately separate from `remarks`, which belongs to the
     * laboratory technician who ran the test. Mixing the two would make it
     * impossible to tell whose clinical judgement a remark represents, and it
     * would be lost the next time the lab updated the report.
     */
    doctorComments: [
      {
        _id: false,
        comment: { type: String, required: true, trim: true, maxlength: 2000 },
        interpretation: { type: String, trim: true, maxlength: 2000 },
        // FR-DR-08: what the doctor decided to do about the finding.
        treatmentDecision: { type: String, trim: true, maxlength: 2000 },
        outcome: { type: String, trim: true, maxlength: 2000 },
        doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        commentedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

labReportSchema.index({ patient: 1, createdAt: -1 });
labReportSchema.index({ doctor: 1, createdAt: -1 });
labReportSchema.index({ status: 1, createdAt: -1 });
// FR-DR-07 report comparison: "this patient's verified reports for this test,
// newest first". Matched exactly by the comparison endpoint.
labReportSchema.index({ patient: 1, test: 1, generatedAt: -1 });
// "Latest revision of each report for this request" - the amend walk.
labReportSchema.index({ labRequest: 1, revision: -1 });

module.exports = mongoose.model("LabReport", labReportSchema);