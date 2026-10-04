const mongoose = require("mongoose");

/**
 * Billing document for a patient.
 *
 * WHY a separate collection rather than a `billing` array on `User`: the SRS
 * requires invoices to be listable, filterable, exportable and payable from the
 * Admin billing workspace, and a Patient must see exactly the same records the
 * Admin sees. An invoice also aggregates several source documents (a consultation
 * fee plus one or more laboratory tests), which cannot be represented by a single
 * field on an existing record.
 *
 * Every amount is computed and stored by the backend from real prices
 * (`User.consultationFee`, `LabTest.price`). The frontend never supplies totals.
 */
const INVOICE_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "VOID"];
const INVOICE_ITEM_TYPES = ["CONSULTATION", "LABORATORY", "OTHER"];

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    itemType: { type: String, enum: INVOICE_ITEM_TYPES, required: true, default: "OTHER" },
    // The connected record this line was billed from, so an invoice line can
    // always be traced back to its appointment / lab request without guessing.
    sourceType: { type: String, trim: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false, versionKey: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    // `labRequests` holds *every* lab request billed by this invoice. `labRequest`
    // is the first of them, kept because screens and reports display one
    // representative request and because documents already written use it.
    // Storing only the first would let the duplicate-billing guard pass a request
    // that was billed as the second line of an earlier invoice.
    labRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "LabRequest" }],
    labRequest: { type: mongoose.Schema.Types.ObjectId, ref: "LabRequest" },
    items: {
      type: [invoiceItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "An invoice must contain at least one line item",
      },
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    // Denormalised from the Payment collection on every recorded/voided payment
    // so the billing list can render a balance without a second query. The
    // service that writes payments is the only writer.
    amountPaid: { type: Number, min: 0, default: 0 },
    balance: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: INVOICE_STATUSES, default: "UNPAID", index: true },
    issuedAt: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

// Admin billing list: newest first, optionally narrowed to one status.
invoiceSchema.index({ status: 1, issuedAt: -1 });
// Patient billing history and monthly revenue reports read this range.
invoiceSchema.index({ patient: 1, issuedAt: -1 });
// Grouping the daily/monthly report by patient name and issue date.
invoiceSchema.index({ issuedAt: -1, patient: 1 });

invoiceSchema.pre("validate", function (next) {
  if (!this.items || this.items.length === 0) return next();

  for (const item of this.items) {
    item.amount = Math.round(Number(item.unitPrice || 0) * Number(item.quantity || 1) * 100) / 100;
  }

  this.subtotal = Math.round(this.items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  this.discount = Math.max(0, Number(this.discount || 0));
  this.tax = Math.max(0, Number(this.tax || 0));

  const total = Math.round((this.subtotal - this.discount + this.tax) * 100) / 100;
  this.total = Math.max(0, total);
  this.amountPaid = Math.max(0, Number(this.amountPaid || 0));
  this.balance = Math.max(0, Math.round((this.total - this.amountPaid) * 100) / 100);

  if (this.status !== "VOID") {
    if (this.balance === 0 && this.total > 0) this.status = "PAID";
    else if (this.amountPaid > 0) this.status = "PARTIALLY_PAID";
    else this.status = "UNPAID";
  }

  return next();
});

module.exports = mongoose.model("Invoice", invoiceSchema);
module.exports.INVOICE_STATUSES = INVOICE_STATUSES;
module.exports.INVOICE_ITEM_TYPES = INVOICE_ITEM_TYPES;