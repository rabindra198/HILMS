const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const LabRequest = require("../models/LabRequest");
const LabTest = require("../models/LabTest");
const auditService = require("./audit.service");
const notificationService = require("./notification.service");
const { nextSequence, highestExistingSequence, withDuplicateRetry } = require("../utils/sequence");
const { PAYMENT_METHODS, PAYMENT_STATUSES } = require("../models/Payment");
const { INVOICE_ITEM_TYPES, INVOICE_STATUSES } = require("../models/Invoice");
// The provider registry, not `payment.service`: the service requires THIS module, so
// importing it back here would be circular. The registry holds no billing logic.
const { availableProviders } = require("./payments/payment.provider");

/**
 * Billing for the whole hospital.
 *
 * One module owns invoices and payments because the two are inseparable: a
 * payment is meaningless without its invoice, and an invoice's `amountPaid` /
 * `balance` / `status` are all derived from the payments against it. Splitting
 * them across two services is how a balance silently drifts from the payments
 * that produced it.
 *
 * Every amount here is computed on the server from real stored prices -
 * `User.consultationFee` for a consultation and `LabTest.price` for a laboratory
 * test. The client may send a quantity and a discount, never a total, and a
 * manual line must carry its own price because there is no catalogue entry for it.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const objectId = (value, name = "id") => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) fail(`A valid ${name} is required`, 422);
  return value;
};

const PATIENT_FIELDS = "name email phone contactNumber";

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

/** Escapes a search box value so it cannot be used as a ReDoS / enumeration vector. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextInvoiceNo = () =>
  nextSequence(
    `invoiceNo:${new Date().getFullYear()}`,
    () => highestExistingSequence(Invoice, "invoiceNo", `INV-${new Date().getFullYear()}-`)
  ).then((seq) => `INV-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`);

const nextPaymentNo = () =>
  nextSequence(
    `paymentNo:${new Date().getFullYear()}`,
    () => highestExistingSequence(Payment, "paymentNo", `PAY-${new Date().getFullYear()}-`)
  ).then((seq) => `PAY-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`);

// ---------------------------------------------------------------------------
// Invoice lines built from real prices
// ---------------------------------------------------------------------------

/**
 * The consultation line for an appointment, priced from the doctor's stored fee.
 *
 * A doctor with no `consultationFee` set produces NO line rather than a zero or
 * invented amount - silently charging a consultation fee that nobody agreed to is
 * worse than leaving it off the invoice for the Admin to price manually.
 */
const consultationLine = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId)
    .populate("doctor", "name consultationFee")
    .lean();
  if (!appointment) fail("Appointment not found", 404);

  const doctor = appointment.doctor;
  const fee = Number(doctor?.consultationFee);

  if (!Number.isFinite(fee) || fee <= 0) return null;

  return {
    description: `Consultation - ${doctor.name}`,
    itemType: "CONSULTATION",
    sourceType: "Appointment",
    sourceId: appointment._id,
    quantity: 1,
    unitPrice: round(fee),
  };
};

/**
 * One line per laboratory request.
 *
 * Priced from the request's own `priceSnapshot`, which the doctor captured when
 * the test was ordered. Falling back to `LabTest.price` (as this did) meant that
 * repricing a test after a patient had been billed for it silently changed an
 * already-raised invoice, and a request ordered before the snapshot existed would
 * pick up whatever the price happened to be on the day the invoice was created.
 *
 * `test.name`/`test.category` still come from the live test row, because those are
 * labels for the reader, not amounts.
 */
const labLines = async (labRequestIds, patientId) => {
  const ids = [
    ...new Set(
      (Array.isArray(labRequestIds) ? labRequestIds : [labRequestIds])
        .filter(Boolean)
        .map((id) => String(objectId(id, "laboratory request id")))
    ),
  ];

  if (!ids.length) return [];

  const requests = await LabRequest.find({ _id: { $in: ids } })
    .populate("test", "name price category")
    .lean();
  if (!requests.length) fail("Laboratory request not found", 404);
  if (requests.length !== ids.length) fail("One or more laboratory requests were not found", 404);

  return requests
    .map((request) => {
      if (String(request.patient) !== String(patientId)) {
        fail("A laboratory request belongs to a different patient", 403);
      }
      if (!["COMPLETED", "VERIFIED"].includes(String(request.status).toUpperCase())) {
        fail("Only completed or verified laboratory requests can be invoiced", 409);
      }
      const snapshot = Number(request.priceSnapshot);
      const live = Number(request.test?.price);
      const price = Number.isFinite(snapshot) && snapshot >= 0 ? snapshot : live;
      if (!Number.isFinite(price) || price < 0) return null;
      return {
        description: `${request.test?.name || "Laboratory test"}${
          request.test?.category ? ` (${request.test.category})` : ""
        }`,
        itemType: "LABORATORY",
        sourceType: "LabRequest",
        sourceId: request._id,
        quantity: 1,
        unitPrice: round(price),
      };
    })
    .filter(Boolean);
};

/** A manually priced line the Admin typed in (procedure, bed, consumable...). */
const manualLine = (entry) => {
  const description = String(entry?.description || "").trim();
  if (!description) fail("Every invoice line needs a description", 422);

  const unitPrice = Number(entry?.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    fail(`"${description}" needs a valid price of 0 or more`, 422);
  }

  const quantity = Number.parseInt(entry?.quantity, 10) || 1;
  if (quantity < 1) fail(`"${description}" needs a quantity of at least 1`, 422);

  return { description, itemType: "OTHER", quantity, unitPrice: round(unitPrice) };
};

/**
 * Creates an invoice.
 *
 * Double-billing is refused at the source: an appointment or a laboratory
 * request that already appears on a non-void invoice cannot be billed again. That
 * check is what stops "issue invoice" from silently charging a patient twice when
 * an Admin clicks it twice.
 */
const createInvoice = async (payload, actor, req) => {
  // `patientId` is the documented field. `patient` is accepted because the
  // invoice body mirrors the `labRequest` naming used elsewhere in this file and
  // an invoice with no patient is a silent, unattributable charge if the field
  // name is merely ignored.
  const patientId = objectId(payload.patientId ?? payload.patient, "patient id");
  const manualItems = Array.isArray(payload.items) ? payload.items : [];
  // Normalised lab ids, kept for the duplicate guard and the stored document.
  let labRequestIds = [];

  const patient = await User.findOne({ _id: patientId, role: "patient" }).select("_id name email").lean();
  if (!patient) fail("Patient not found", 404);

  const lines = [];

  if (payload.appointment) {
    const existing = await Invoice.findOne({ appointment: payload.appointment, status: { $ne: "VOID" } })
      .select("invoiceNo")
      .lean();
    if (existing) fail(`This appointment was already billed on ${existing.invoiceNo}`, 409);
    lines.push(await consultationLine(payload.appointment));
  }

  if (payload.labRequestIds || payload.labRequest) {
    const ids = [...new Set((payload.labRequestIds || [payload.labRequest]).map((value) => String(objectId(value, "laboratory request id"))))];
    // Match against the full `labRequests` array as well as the legacy
    // `labRequest`, otherwise a request billed as the *second* line of an
    // earlier invoice would not be found here and could be billed twice.
    const existing = await Invoice.findOne({
      status: { $ne: "VOID" },
      $or: [{ labRequests: { $in: ids } }, { labRequest: { $in: ids } }],
    })
      .select("invoiceNo")
      .lean();
    if (existing) fail(`This laboratory request was already billed on ${existing.invoiceNo}`, 409);
    labRequestIds = ids;
    lines.push(...(await labLines(ids, patientId)));
  }

  lines.push(...manualItems.map(manualLine));
  const items = lines.filter(Boolean);

  if (!items.length) {
    fail(
      "There is nothing to bill. Add a line, or bill an appointment or laboratory request that has a price.",
      422
    );
  }

  const discount = Number(payload.discount || 0);
  if (!Number.isFinite(discount) || discount < 0) fail("Discount must be 0 or more", 422);

  const tax = Number(payload.tax || 0);
  if (!Number.isFinite(tax) || tax < 0) fail("Tax must be 0 or more", 422);

  const subtotal = round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  if (discount > subtotal) fail("Discount cannot be greater than the invoice total", 422);

  const invoice = await withDuplicateRetry(async () =>
    Invoice.create({
      invoiceNo: await nextInvoiceNo(),
      patient: patientId,
      appointment: payload.appointment || undefined,
      labRequests: labRequestIds.length ? labRequestIds : undefined,
      labRequest: labRequestIds[0],
      items,
      subtotal,
      discount: round(discount),
      tax: round(tax),
      total: round(subtotal - discount + tax),
      amountPaid: 0,
      balance: round(subtotal - discount + tax),
      status: "UNPAID",
      issuedAt: payload.issuedAt ? new Date(payload.issuedAt) : new Date(),
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      notes: payload.notes ? String(payload.notes).trim() : undefined,
      createdBy: actor?._id,
    })
  );

  await auditService.record({
    action: "INVOICE_ISSUED",
    actor,
    targetType: "Invoice",
    targetId: invoice._id,
    targetEmail: patient.email,
    metadata: {
      invoiceNo: invoice.invoiceNo,
      total: invoice.total,
      lines: items.length,
      appointment: payload.appointment || null,
      labRequests: labRequestIds.length,
    },
    req,
  });

  await notificationService.notifyAdmins({
    type: "INVOICE_ISSUED",
    title: "Invoice issued",
    message: `${invoice.invoiceNo} for ${patient.name} was issued at ${invoice.total}.`,
    entityType: "Invoice",
    entityId: invoice._id,
    preference: "billingAlerts",
  });

  return getInvoice(invoice._id);
};

/** Completed laboratory requests for one patient that have not been invoiced. */
const getBillableLabRequests = async (patientId) => {
  const patientObjectId = objectId(patientId, "patient id");
  const [requests, invoices] = await Promise.all([
    LabRequest.find({
      patient: patientObjectId,
      status: { $in: ["COMPLETED", "completed", "Completed", "VERIFIED", "verified", "Verified"] },
    })
      .populate("test", "name category price")
      .sort({ createdAt: -1 })
      .lean(),
    Invoice.find({ patient: patientObjectId, status: { $ne: "VOID" } })
      .select("labRequests labRequest")
      .lean(),
  ]);

  const billedRequestIds = new Set();
  for (const invoice of invoices) {
    for (const requestId of invoice.labRequests || []) billedRequestIds.add(String(requestId));
    if (invoice.labRequest) billedRequestIds.add(String(invoice.labRequest));
  }

  return requests
    .filter((request) => !billedRequestIds.has(String(request._id)))
    .map((request) => {
      const snapshot = Number(request.priceSnapshot);
      const live = Number(request.test?.price);
      return {
        _id: request._id,
        patient: request.patient,
        test: request.test,
        status: request.status,
        requestedDate: request.requestedDate,
        amount: round(Number.isFinite(snapshot) && snapshot >= 0 ? snapshot : live),
      };
    })
    .filter((request) => Number.isFinite(request.amount) && request.amount >= 0);
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Shared filter builder so the list, the export and the summary agree. */
const buildInvoiceFilter = ({ status, patientId, search, from, to } = {}) => {
  const filter = {};

  if (status) {
    const wanted = String(status).toUpperCase();
    if (!INVOICE_STATUSES.includes(wanted)) fail(`Invoice status "${status}" is not valid`, 422);
    filter.status = wanted;
  }

  if (patientId) filter.patient = objectId(patientId, "patient id");

  if (from || to) {
    filter.issuedAt = {};
    if (from) filter.issuedAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (Number.isNaN(end.getTime())) fail("The end of the date range is not valid", 422);
      // `to` is inclusive of the whole day, because the UI passes a date picker
      // value and "today" means up to 23:59, not 00:00.
      end.setHours(23, 59, 59, 999);
      filter.issuedAt.$lte = end;
    }
  }

  return filter;
};

const listInvoices = async (query = {}) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const filter = buildInvoiceFilter(query);

  if (query.search) {
    const regex = new RegExp(escapeRegex(String(query.search).trim()), "i");
    // An `$in: []` clause simply matches nothing, so a search that matches no
    // patient narrows the result to invoices whose number matches - it never
    // widens it.
    filter.$or = [{ invoiceNo: regex }, { patient: { $in: await matchingPatientIds(regex) } }];
  }

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .populate("patient", PATIENT_FIELDS)
      .sort({ issuedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const matchingPatientIds = async (regex) => {
  const rows = await User.find({ role: "patient", $or: [{ name: regex }, { email: regex }] })
    .select("_id")
    .lean();
  return rows.map((row) => row._id);
};

const getInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(objectId(invoiceId, "invoice id"))
    .populate("patient", PATIENT_FIELDS)
    .populate("appointment", "appointmentNo appointmentDate startMinutes status")
    .populate("labRequest", "requestId status test")
    .lean();
  if (!invoice) fail("Invoice not found", 404);

  const payments = await Payment.find({ invoice: invoice._id })
    .populate("receivedBy", "name email")
    .sort({ paidAt: -1 })
    .lean();

  return { ...invoice, payments };
};

const buildPaymentFilter = ({ status, method, patientId, from, to } = {}) => {
  const filter = {};

  if (status) {
    const wanted = String(status).toUpperCase();
    if (!PAYMENT_STATUSES.includes(wanted)) fail(`Payment status "${status}" is not valid`, 422);
    filter.status = wanted;
  }

  if (method) {
    const wanted = String(method).toUpperCase();
    if (!PAYMENT_METHODS.includes(wanted)) fail(`Payment method "${method}" is not valid`, 422);
    filter.method = wanted;
  }

  if (patientId) filter.patient = objectId(patientId, "patient id");

  if (from || to) {
    filter.paidAt = {};
    if (from) filter.paidAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (Number.isNaN(end.getTime())) fail("The end of the date range is not valid", 422);
      end.setHours(23, 59, 59, 999);
      filter.paidAt.$lte = end;
    }
  }

  return filter;
};

const listPayments = async (query = {}) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const filter = buildPaymentFilter(query);

  if (query.search) {
    const regex = new RegExp(escapeRegex(String(query.search).trim()), "i");
    filter.$or = [{ paymentNo: regex }, { transactionRef: regex }];
  }

  const [items, total] = await Promise.all([
    Payment.find(filter)
      .populate("patient", PATIENT_FIELDS)
      .populate("invoice", "invoiceNo total balance status")
      .populate("receivedBy", "name email")
      .sort({ paidAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Records a payment against an invoice.
 *
 * The invoice's `amountPaid`, `balance` and `status` are recomputed from the
 * SUCCESS payments only, then written back. They are denormalised on purpose (the
 * billing list would otherwise need an aggregation per row), so this function is
 * the ONLY place that writes them - which is why the recompute reads the payments
 * back rather than incrementing a counter that a rollback could leave wrong.
 */
const recordPayment = async (payload, actor, req) => {
  const invoiceId = objectId(payload.invoiceId, "invoice id");

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) fail("Invoice not found", 404);
  if (invoice.status === "VOID") fail("A voided invoice cannot take a payment", 409);

  const amount = round(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) fail("Payment amount must be more than 0", 422);

  const method = String(payload.method || "").toUpperCase();
  if (!PAYMENT_METHODS.includes(method)) {
    fail(`Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`, 422);
  }

  // Card and online settlement happens through a gateway, so a reference is the
  // only way to trace a disputed charge. Cash does not have one.
  // ESEWA payments are NOT recorded here: they are created by `payment.service`
  // from a gateway-verified transaction, so an administrator cannot type in an
  // eSewa payment that eSewa never confirmed. KHALTI stays in this list only so
  // historical rows still validate.
  if (["CARD", "ONLINE", "KHALTI"].includes(method) && !String(payload.transactionRef || "").trim()) {
    fail(`A ${method.toLowerCase()} payment needs its transaction reference`, 422);
  }

  if (method === "ESEWA") {
    fail(
      "An eSewa payment is recorded by the payment service once eSewa confirms it, not entered by hand.",
      422
    );
  }

  if (amount > invoice.balance + 0.001) {
    fail(
      `That is more than the outstanding balance on ${invoice.invoiceNo} (${invoice.balance} remaining)`,
      422
    );
  }

  const payment = await withDuplicateRetry(async () =>
    Payment.create({
      paymentNo: await nextPaymentNo(),
      invoice: invoice._id,
      patient: invoice.patient,
      amount,
      method,
      status: "SUCCESS",
      transactionRef: String(payload.transactionRef || "").trim() || undefined,
      note: payload.note ? String(payload.note).trim() : undefined,
      paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
      receivedBy: actor?._id,
    })
  );

  await syncInvoiceTotals(invoice._id);

  await auditService.record({
    action: "PAYMENT_RECORDED",
    actor,
    targetType: "Payment",
    targetId: payment._id,
    metadata: {
      paymentNo: payment.paymentNo,
      invoiceNo: invoice.invoiceNo,
      amount: payment.amount,
      method: payment.method,
    },
    req,
  });

  const updated = await Invoice.findById(invoice._id).lean();
  await notificationService.notifyAdmins({
    type: "PAYMENT_RECORDED",
    title: "Payment received",
    message: `${payment.paymentNo} settled ${payment.amount} against ${invoice.invoiceNo}.`,
    entityType: "Payment",
    entityId: payment._id,
    preference: "billingAlerts",
  });

  await notificationService.notifyUser({
    recipient: invoice.patient,
    type: "PAYMENT_RECORDED",
    title: "Payment received",
    message: `We received your payment of ${payment.amount} for invoice ${invoice.invoiceNo}.`,
    entityType: "Payment",
    entityId: payment._id,
  });

  return { payment, invoice: updated };
};

/** Recomputes the denormalised money fields on an invoice from its payments. */
const syncInvoiceTotals = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return null;

  const paid = await Payment.aggregate([
    { $match: { invoice: invoice._id, status: "SUCCESS" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  invoice.amountPaid = round(paid[0]?.total || 0);
  invoice.balance = round(Math.max(0, invoice.total - invoice.amountPaid));

  if (invoice.balance === 0 && invoice.total > 0) invoice.status = "PAID";
  else if (invoice.amountPaid > 0) invoice.status = "PARTIALLY_PAID";
  else invoice.status = "UNPAID";

  await invoice.save();
  return invoice;
};

/**
 * Voids an invoice.
 *
 * Refused while any payment exists, including a voided invoice's own payments -
 * voiding is not a reversal. The supported route is to refund the payment first,
 * which keeps the financial trail intact.
 */
const voidInvoice = async (invoiceId, reason, actor, req) => {
  const invoice = await Invoice.findById(objectId(invoiceId, "invoice id"));
  if (!invoice) fail("Invoice not found", 404);
  if (invoice.status === "VOID") fail("This invoice is already void", 409);

  const payments = await Payment.countDocuments({ invoice: invoice._id });
  if (payments > 0) {
    fail(
      "This invoice has recorded payments. Refund those payments before voiding it.",
      409
    );
  }

  invoice.status = "VOID";
  invoice.balance = 0;
  invoice.voidedAt = new Date();
  invoice.voidReason = String(reason || "").trim() || "Voided by administrator";
  await invoice.save();

  await auditService.record({
    action: "INVOICE_VOIDED",
    actor,
    targetType: "Invoice",
    targetId: invoice._id,
    metadata: { invoiceNo: invoice.invoiceNo, reason: invoice.voidReason },
    req,
  });

  return getInvoice(invoice._id);
};

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/**
 * The billing summary behind the Billing tab and the dashboard revenue card.
 *
 * `collected` counts SUCCESS payments and `outstanding` counts what is still owed
 * on non-void invoices. They are derived from different collections on purpose:
 * revenue is money actually received, not money billed.
 */
const getSummary = async (query = {}) => {
  const issuedFilter = buildInvoiceFilter(query);
  const paymentFilter = buildPaymentFilter(query);
  delete issuedFilter.status;
  delete paymentFilter.status;

  const issuedAt = issuedFilter.issuedAt || {};
  const paidAt = paymentFilter.paidAt || {};

  const [issuedAgg, collectedAgg, byStatusAgg, byMethodAgg, outstandingAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...issuedFilter, status: { $ne: "VOID" } } },
      {
        $group: {
          _id: null,
          invoiced: { $sum: "$total" },
          count: { $sum: 1 },
          discounts: { $sum: "$discount" },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { ...paymentFilter, status: "SUCCESS" } },
      { $group: { _id: null, collected: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: issuedFilter },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$total" }, balance: { $sum: "$balance" } } },
    ]),
    Payment.aggregate([
      { $match: { ...paymentFilter, status: "SUCCESS" } },
      { $group: { _id: "$method", count: { $sum: 1 }, total: { $sum: "$amount" } } },
    ]),
    Invoice.aggregate([
      { $match: { ...issuedFilter, status: { $in: ["UNPAID", "PARTIALLY_PAID"] } } },
      { $group: { _id: null, outstanding: { $sum: "$balance" }, count: { $sum: 1 } } },
    ]),
  ]);

  const recentPayments = await Payment.find({ status: "SUCCESS" })
    .populate("patient", PATIENT_FIELDS)
    .populate("invoice", "invoiceNo")
    .sort({ paidAt: -1 })
    .limit(5)
    .lean();

  const invoiced = round(issuedAgg[0]?.invoiced || 0);
  const collected = round(collectedAgg[0]?.collected || 0);

  return {
    range: { from: issuedAt.$gte || null, to: issuedAt.$lte || null },
    invoiced,
    invoicedCount: issuedAgg[0]?.count || 0,
    collected,
    collectedCount: collectedAgg[0]?.count || 0,
    outstanding: round(outstandingAgg[0]?.outstanding || 0),
    outstandingCount: outstandingAgg[0]?.count || 0,
    discounts: round(issuedAgg[0]?.discounts || 0),
    byStatus: INVOICE_STATUSES.map((status) => {
      const row = byStatusAgg.find((entry) => entry._id === status);
      return {
        status,
        count: row?.count || 0,
        total: round(row?.total || 0),
        balance: round(row?.balance || 0),
      };
    }),
    byMethod: PAYMENT_METHODS.map((method) => {
      const row = byMethodAgg.find((entry) => entry._id === method);
      return { method, count: row?.count || 0, total: round(row?.total || 0) };
    }).filter((row) => row.count > 0),
    recentPayments,
  };
};

/**
 * Everything one patient owes and has paid.
 *
 * The patient module and the Admin billing workspace both read this, which is what
 * guarantees a patient sees the same figures the Admin does. `pendingCharges`
 * additionally surfaces verified laboratory work that has not been invoiced yet,
 * so the patient is not told they owe nothing while a real charge is unbilled.
 */
const getPatientBilling = async (patientId) => {
  const id = objectId(patientId, "patient id");

  const [invoices, payments, pendingLab] = await Promise.all([
    Invoice.find({ patient: id })
      .sort({ issuedAt: -1 })
      .lean(),
    Payment.find({ patient: id }).sort({ paidAt: -1 }).lean(),
    LabRequest.find({ patient: id, status: { $in: ["COMPLETED", "VERIFIED"] } })
      .populate("test", "name price category")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // A verified lab request already on a live invoice is billed; anything else is
  // not, and is surfaced as an amount the patient has not yet been charged.
  // Both the `labRequests` array and the legacy `labRequest` are read, otherwise
  // a request billed as a later line would resurface as an unpaid charge.
  const billedLabRequests = new Set();
  for (const invoice of invoices) {
    if (invoice.status === "VOID") continue;
    for (const billed of invoice.labRequests || []) billedLabRequests.add(String(billed));
    if (invoice.labRequest) billedLabRequests.add(String(invoice.labRequest));
  }

  const pendingCharges = pendingLab
    .filter((request) => !billedLabRequests.has(String(request._id)))
    .map((request) => ({
      id: request._id,
      description: `${request.test?.name || "Laboratory test"}`,
      category: request.test?.category || null,
      // Same rule as labLines: the ordered snapshot is the amount owed, and only
      // a request with no snapshot falls back to the live catalogue price.
      amount: round(
        Number.isFinite(Number(request.priceSnapshot)) && Number(request.priceSnapshot) >= 0
          ? Number(request.priceSnapshot)
          : Number(request.test?.price) || 0
      ),
      status: request.status,
      date: request.createdAt,
    }));

  const nonVoid = invoices.filter((invoice) => invoice.status !== "VOID");
  const outstanding = round(nonVoid.reduce((sum, invoice) => sum + (invoice.balance || 0), 0));
  const invoiced = round(nonVoid.reduce((sum, invoice) => sum + (invoice.total || 0), 0));
  const paid = round(payments.filter((payment) => payment.status === "SUCCESS").reduce((sum, payment) => sum + payment.amount, 0));

  return {
    summary: {
      invoiced,
      paid,
      outstanding,
      invoiceCount: nonVoid.length,
      pendingChargeTotal: round(pendingCharges.reduce((sum, charge) => sum + charge.amount, 0)),
      // Whether any gateway is usable right now, taken from the provider registry so
      // the Patient screens and the payment screens cannot disagree. No secret.
      gatewayConfigured: availableProviders().length > 0,
    },
    invoices,
    payments,
    pendingCharges,
  };
};

module.exports = {
  createInvoice,
  getBillableLabRequests,
  listInvoices,
  getInvoice,
  recordPayment,
  voidInvoice,
  getSummary,
  getPatientBilling,
  listPayments,
  syncInvoiceTotals,
  buildInvoiceFilter,
  buildPaymentFilter,
  matchingPatientIds,
  escapeRegex,
  nextInvoiceNo,
  nextPaymentNo,
  round,
  PATIENT_FIELDS,
};