const mongoose = require("mongoose");

/**
 * A single settled (or attempted) payment against an `Invoice`.
 *
 * One payment record per transaction keeps the audit trail honest: a partial
 * payment followed by a second one produces two rows rather than an overwritten
 * total, and a failed gateway attempt is recorded instead of being hidden.
 *
 * KHALTI in `PAYMENT_METHODS` is HISTORICAL ONLY. Khalti was the previous online
 * provider; eSewa is the active one. The value is deliberately kept in the enum
 * because dropping it would make every existing Khalti row fail validation on the
 * next `save()`, and rewriting those rows to "ESEWA" would falsify history. New
 * online payments use `ESEWA`.
 */
const PAYMENT_METHODS = ["CASH", "CARD", "KHALTI", "BANK_TRANSFER", "ONLINE", "ESEWA"];
const PAYMENT_STATUSES = ["SUCCESS", "PENDING", "FAILED", "REFUNDED"];

/**
 * Online gateways. `null`/absent means the payment was settled in person
 * (cash, card terminal, bank transfer) and never touched a gateway.
 */
const PAYMENT_PROVIDERS = ["ESEWA", "KHALTI"];

const paymentSchema = new mongoose.Schema(
  {
    paymentNo: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "SUCCESS", index: true },
    // Gateway / bank reference. Required for card and online settlement so a
    // disputed charge can be traced back to the processor.
    transactionRef: { type: String, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 500 },
    paidAt: { type: Date, default: Date.now, index: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ---- Online gateway fields -------------------------------------------
    // Which gateway settled this. Absent for in-person payments.
    provider: { type: String, enum: PAYMENT_PROVIDERS, index: true },
    // The merchant-side id sent to the gateway. Unique so the same gateway
    // transaction can never be recorded twice, and sparse so every existing
    // in-person payment is exempt from the index.
    transactionUuid: { type: String, trim: true, uppercase: true, index: true, unique: true, sparse: true },
    // The gateway's own reference for the settled transaction (`transaction_code`),
    // which is what a support request is answered with.
    providerRef: { type: String, trim: true, maxlength: 120 },
    // The raw status string the gateway last reported (e.g. "COMPLETE"). Kept
    // verbatim so an unmapped value is still visible rather than lost.
    providerStatus: { type: String, trim: true, maxlength: 60 },
    // Why a gateway attempt ended in FAILED, for the retry/audit trail.
    failureReason: { type: String, trim: true, maxlength: 300 },
    // When the redirect to the gateway was issued, so a PENDING row can be aged.
    initiatedAt: { type: Date },
  },
  { timestamps: true }
);

// Only SUCCESS rows count towards a paid total, so the filter is indexed rather
// than applied to every payment at read time.
paymentSchema.index({ status: 1, paidAt: -1 });
paymentSchema.index({ patient: 1, paidAt: -1 });
paymentSchema.index({ invoice: 1, paidAt: -1 });
paymentSchema.index({ provider: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.PAYMENT_PROVIDERS = PAYMENT_PROVIDERS;