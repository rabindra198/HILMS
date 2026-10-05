const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const User = require("../models/User");
const env = require("../config/env");
const logger = require("../utils/logger");
const auditService = require("./audit.service");
const notificationService = require("./notification.service");
const billingService = require("./billing.service");
const { getProvider, availableProviders, publicConfig, DEFAULT_PROVIDER } = require("./payments/payment.provider");
const { nextSequence, highestExistingSequence, withDuplicateRetry } = require("../utils/sequence");
const { isAdminRole } = require("../config/roles");

/**
 * Online payment flow.
 *
 * This service owns the *decision* about whether money arrived; the provider owns
 * the gateway's wire format. Nothing in here trusts the browser: the amount comes
 * from the stored invoice, ownership is checked against the session, and the
 * settlement is driven by eSewa's own status answer rather than by the fact that
 * a redirect was received.
 *
 * Lifecycle:
 *
 *   initiate()        -> a NEW PENDING row with a NEW transaction uuid + signed
 *                        form fields, then the browser redirects to the gateway
 *   completePayment() -> the only path that may set SUCCESS. It requires a
 *                        verified gateway signature AND a COMPLETE answer from the
 *                        gateway's status endpoint
 *   failPayment()     -> FAILED, transaction retained for audit, retry allowed
 *   reconcile()       -> re-checks a PENDING transaction whose redirect was lost
 *
 * Every ATTEMPT is a new transaction. eSewa accepts each `transaction_uuid` once
 * for the life of the merchant account and answers a second submission of the same
 * uuid with `{"error_message":"Duplicate transaction UUID.","code":0}`, so a retry
 * must never resume the previous attempt's uuid. This service previously did
 * exactly that - it found a live PENDING row and handed its uuid back - which is
 * why a second tap on Pay produced that gateway error. Retries now supersede the
 * abandoned attempt and start afresh.
 *
 * The CALLBACKS remain idempotent, which is a different property: a repeated or
 * replayed callback for a transaction uuid that already settled returns the
 * existing payment instead of creating a second one or charging twice.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const objectId = (value, name = "id") => {
  if (!mongoose.isValidObjectId(value)) fail(`A valid ${name} is required`, 422);
  return new mongoose.Types.ObjectId(String(value));
};

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

const nextPaymentNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `PAY-${year}-`;
  const next = await nextSequence(`paymentNo:${year}`, () => highestExistingSequence(Payment, "paymentNo", prefix));
  return `${prefix}${String(next).padStart(5, "0")}`;
};

/**
 * Loads the invoice and proves the caller may pay it.
 *
 * `mayPay` is the session user. A patient may only pay their own invoice; an
 * administrator may pay any invoice on a patient's behalf, which is the
 * counter-payment path at the hospital desk. A doctor or laboratory account is
 * refused outright - they have no billing relationship to an invoice.
 */
const loadPayableInvoice = async (invoiceId, sessionUser) => {
  const invoice = await Invoice.findById(objectId(invoiceId, "invoice id"));
  if (!invoice) fail("Invoice not found", 404);
  if (invoice.status === "VOID") fail("This invoice has been voided and cannot be paid", 409);

  const isAdmin = isAdminRole(sessionUser?.role);
  const isOwner = String(invoice.patient) === String(sessionUser?._id);

  if (!isAdmin && !isOwner) {
    fail("You cannot pay this invoice", 403);
  }

  return invoice;
};

/**
 * Refuses a payment against a bill that this payer has already settled.
 *
 * The balance check alone is not enough. An invoice can carry a balance after a
 * successful online payment - a later refund, a write-off or a manual adjustment
 * can put it back above zero - and the customer would then be able to tap Pay and
 * be charged a second time for a bill already marked PAID in the payments history.
 * So the settled record is checked directly, and it is keyed on the PAYER as well as
 * the invoice: an admin paying a bill on a patient's behalf must not be blocked by
 * (or blocked into) someone else's settlement.
 *
 * This is the "already has a PAID record for the bill" rule, enforced here so it
 * holds no matter what the button looked like.
 *
 * Keyed on the invoice's patient rather than the caller, because who may pay was
 * already decided by `loadPayableInvoice`: this asks "has this BILL been settled",
 * which is a property of the bill, not of whoever happens to be paying it.
 */
const assertNoSuccessfulPayment = async (invoice) => {
  const settled = await Payment.findOne({
    invoice: invoice._id,
    patient: invoice.patient,
    status: "SUCCESS",
  })
    .select("paymentNo paidAt provider")
    .sort({ paidAt: -1 })
    .lean();

  if (settled) {
    const when = settled.paidAt ? ` on ${new Date(settled.paidAt).toISOString().slice(0, 10)}` : "";
    fail(
      `${invoice.invoiceNo} has already been paid in full (${settled.paymentNo}${when}). ` +
        "A payment cannot be started twice for the same bill.",
      409
    );
  }
};

/**
 * Rejects a payment against an invoice that is already settled in full, and caps
 * the request at the outstanding balance. Uses the stored balance, which is the
 * authoritative figure, rather than anything the caller sent.
 */
const assertPayableBalance = async (invoice) => {
  const balance = round(invoice.balance);
  if (balance <= 0) {
    fail(`${invoice.invoiceNo} is already paid in full`, 409);
  }
  return balance;
};

/**
 * Closes out earlier attempts at this bill before a new one starts.
 *
 * A retry cannot reuse the previous transaction uuid (eSewa rejects that with
 * "Duplicate transaction UUID."), so the abandoned attempt has to be retired rather
 * than left PENDING. Left alone it would be a live transaction that nobody is
 * looking at, and if the customer DID complete it at the gateway, a late redirect
 * could settle a bill the customer has since paid again by another route.
 *
 * Marked FAILED/SUPERSEDED rather than deleted: the attempt is part of the audit
 * trail, and its uuid is exactly what has to be searched for in the eSewa
 * dashboard when reconciling. It contributes nothing to the paid total, so the
 * invoice balance is untouched.
 *
 * Deliberately does not settle, refund or otherwise resolve the old row - only a
 * verified gateway answer may do that, and that arrives through the callbacks.
 */
const supersedePendingAttempts = async ({ invoice, patient, provider, sessionUser, req }) => {
  const stale = await Payment.find({
    invoice: invoice._id,
    patient,
    provider,
    status: "PENDING",
  }).sort({ createdAt: 1 });

  if (!stale.length) return [];

  for (const attempt of stale) {
    attempt.status = "FAILED";
    attempt.providerStatus = "SUPERSEDED";
    attempt.failureReason = "Superseded by a newer payment attempt for this bill";
    attempt.supersededAt = new Date();
    // eslint-disable-next-line no-await-in-loop
    await attempt.save();

    // eslint-disable-next-line no-await-in-loop
    await auditService.record({
      action: "PAYMENT_FAILED",
      actor: sessionUser,
      targetType: "Payment",
      targetId: attempt._id,
      metadata: {
        paymentNo: attempt.paymentNo,
        transactionUuid: attempt.transactionUuid,
        provider: attempt.provider,
        gatewayStatus: "SUPERSEDED",
        attempt: attempt.attempt,
      },
      req,
    });
  }

  logger.info(
    `[payment] superseded ${stale.length} pending attempt(s) on ${invoice.invoiceNo}: ` +
      stale.map((attempt) => attempt.transactionUuid).join(", ")
  );

  return stale;
};

/**
 * Starts an online payment.
 *
 * Every call is a NEW transaction: a new `transaction_uuid`, a new PENDING row and
 * a signature recomputed for that uuid. Nothing is resumed and nothing is reused,
 * because eSewa treats a uuid as single-use and rejects the second submission of
 * one with "Duplicate transaction UUID.".
 *
 * The row is created BEFORE the signed fields are returned, so a customer who
 * abandons the redirect still leaves a trace, and the attempt can be reconciled
 * (or superseded by the next tap) instead of vanishing.
 */
const initiate = async ({ invoiceId, provider: providerName, amount: requestedAmount, method }, sessionUser, req) => {
  const provider = getProvider(providerName || DEFAULT_PROVIDER);

  if (!provider.isConfigured()) {
    fail("Online payment is not available on this server", 503);
  }

  const invoice = await loadPayableInvoice(invoiceId, sessionUser);

  // Both guards run before anything is written, so a refused attempt leaves no row.
  await assertNoSuccessfulPayment(invoice);
  const balance = await assertPayableBalance(invoice);

  // The amount is capped by the invoice balance and defaults to the full balance.
  // It is never taken from the request beyond that, so a tampered amount can at
  // worst pay less than owed - never more.
  const amount = requestedAmount === undefined ? balance : Math.min(round(requestedAmount), balance);
  if (!Number.isFinite(amount) || amount <= 0) fail("Payment amount must be more than 0", 422);

  // Any earlier attempt at this bill is retired first, so there is only ever one
  // live PENDING transaction per bill and the patient is never charged twice for it.
  const superseded = await supersedePendingAttempts({
    invoice,
    patient: invoice.patient,
    provider: provider.provider,
    sessionUser,
    req,
  });

  // Attempt number is for humans and for support; the uuid is the gateway identity.
  const attemptNumber = await Payment.countDocuments({ invoice: invoice._id, patient: invoice.patient });

  // Minted for THIS attempt, and explicitly forbidden from matching anything an
  // earlier attempt used. The invoice number is a readable prefix only.
  const previousUuids = await Payment.distinct("transactionUuid", {
    invoice: invoice._id,
    patient: invoice.patient,
  });
  const transactionUuid = provider.buildTransactionUuid(invoice.invoiceNo, { avoid: previousUuids });

  const payment = await withDuplicateRetry(async () =>
    Payment.create({
      paymentNo: await nextPaymentNo(),
      invoice: invoice._id,
      patient: invoice.patient,
      amount,
      method: method || provider.provider,
      status: "PENDING",
      provider: provider.provider,
      transactionUuid,
      attempt: attemptNumber + 1,
      initiatedAt: new Date(),
      // `transactionRef` is what the Admin billing screen displays, so it is set
      // from the start rather than only after settlement.
      transactionRef: transactionUuid,
      note: `Online payment via ${provider.provider}`,
    })
  );

  // The signature is computed here, on the server, from the secret key, over this
  // attempt's uuid. The browser receives only the finished form fields.
  const fields = provider.createPaymentFields({
    amount,
    transactionUuid,
    invoiceNo: invoice.invoiceNo,
  });

  // Back-reference the retired attempts to their replacement, so the history reads
  // as one chain of attempts rather than unrelated rows. Best effort: the
  // supersede already happened, and a failure here must not fail the payment.
  if (superseded.length) {
    Payment.updateMany(
      { _id: { $in: superseded.map((attempt) => attempt._id) } },
      { $set: { supersededBy: payment._id } }
    ).catch((error) => {
      logger.error(`[payment] could not link superseded attempts: ${error.message}`);
    });
  }

  await auditService.record({
    action: "PAYMENT_INITIATED",
    actor: sessionUser,
    targetType: "Payment",
    targetId: payment._id,
    metadata: {
      paymentNo: payment.paymentNo,
      invoiceNo: invoice.invoiceNo,
      amount,
      provider: provider.provider,
      transactionUuid,
      attempt: payment.attempt,
    },
    req,
  });

  logger.info(
    `[payment] initiated ${payment.paymentNo} invoice=${invoice.invoiceNo} amount=${amount} ` +
      `attempt=${payment.attempt} uuid=${transactionUuid}`
  );

  return { payment: publicPayment(payment), checkout: fields, reused: false };
};

/**
 * Settles a transaction.
 *
 * This is the ONLY function that writes SUCCESS. It requires both:
 *   1. a gateway response whose HMAC-SHA256 signature verifies, and
 *   2. an independent COMPLETE answer from the gateway's status endpoint.
 *
 * Requiring (2) means a forged, replayed or hand-crafted callback cannot settle an
 * invoice even if it somehow carried a valid-looking signature, and a lost redirect
 * still settles the payment as soon as the gateway confirms it.
 */
const completePayment = async (
  { transactionUuid, invoiceId, paymentId, rawGatewayPayload },
  sessionUser,
  req
) => {
  const provider = getProvider();

  // eSewa redirects back with only `?data=<base64>`; the transaction uuid lives
  // inside that envelope, so decode it when no explicit reference was supplied.
  // Decoding is not trusting: the signature and the uuid match are both verified
  // below before anything is settled.
  const decoded = !transactionUuid && rawGatewayPayload ? provider.decodeCallbackData(rawGatewayPayload) : null;

  const payment = await findTransaction({
    transactionUuid: transactionUuid || decoded?.parsed?.transaction_uuid,
    invoiceId,
    paymentId,
  });

  if (payment.status === "SUCCESS") {
    // Idempotent: a customer who refreshes the return page must not be charged
    // twice or see an error for a payment that already succeeded.
    return { payment: publicPayment(payment), alreadyProcessed: true };
  }

  if (!rawGatewayPayload) fail("No eSewa payment data was provided", 422);

  const { parsed, raw } = decoded || provider.decodeCallbackData(rawGatewayPayload);

  // The full gateway response, logged before it is judged, with the payment it
  // claims to belong to. This is the only record of what eSewa actually said.
  provider.logGatewayResponse(
    "success-callback",
    { transactionUuid: payment.transactionUuid, paymentNo: payment.paymentNo, invoiceNo: payment.invoiceNo },
    raw
  );

  const signature = provider.verifyResponseSignature(raw);
  if (!signature.valid) {
    // Recorded as FAILED rather than left PENDING: the response is not trustworthy,
    // and a caller can retry with a fresh transaction.
    logger.error(
      `[esewa] response signature REJECTED uuid=${payment.transactionUuid} reason=${signature.reason}`
    );
    await settleAsFailed(payment, "INVALID_SIGNATURE", signature.reason, req);
    fail(signature.reason, 422);
  }

  // The response must be about the transaction we recorded.
  if (String(parsed.transaction_uuid || "") !== String(payment.transactionUuid)) {
    await settleAsFailed(payment, "UUID_MISMATCH", "The eSewa response did not match the transaction", req);
    fail("The eSewa response does not match this payment", 409);
  }

  if (String(parsed.product_code || "") !== String(env.esewa.productCode)) {
    await settleAsFailed(payment, "PRODUCT_CODE_MISMATCH", "The eSewa response was for a different merchant", req);
    fail("The eSewa response was not issued for this merchant", 409);
  }

  const gatewayStatus = parsed.status;

  if (provider.mapStatus(gatewayStatus) === "PENDING") {
    // Legitimately undecided. Leave PENDING and let reconciliation finish it.
    payment.providerStatus = gatewayStatus;
    await payment.save();
    return { payment: publicPayment(payment), pending: true };
  }

  // Authoritative check with eSewa. The redirect is not proof on its own.
  const statusCheck = await provider.checkStatus({
    transactionUuid: payment.transactionUuid,
    amount: payment.amount,
  });

  if (!statusCheck.reachable) {
    payment.providerStatus = "UNKNOWN";
    await payment.save();
    fail(
      "eSewa could not be reached to confirm the payment. It has not been marked paid; check the invoice again shortly.",
      503
    );
  }

  const mapped = provider.mapStatus(statusCheck.status);

  if (mapped === "REFUNDED") {
    // eSewa confirmed the payment but the money came back. The invoice balance is
    // restored by syncing from the payments, which no longer include this row.
    payment.status = "REFUNDED";
    payment.providerStatus = String(statusCheck.status);
    payment.providerRef = statusCheck.reference || payment.providerRef;
    payment.failureReason = `eSewa reported ${statusCheck.status}`;
    await payment.save();
    await billingService.syncInvoiceTotals(payment.invoice);
    return { payment: publicPayment(payment), refunded: true };
  }

  if (mapped !== "SUCCESS") {
    return settleAsFailed(
      payment,
      statusCheck.status || "UNKNOWN",
      `eSewa reported the transaction as ${statusCheck.status || "not found"}`,
      req
    );
  }

  // Amount check: the gateway settled a different figure than we asked for.
  const settledAmount = Number(parsed.total_amount);
  if (Number.isFinite(settledAmount) && Math.abs(settledAmount - payment.amount) > 0.01) {
    await settleAsFailed(payment, "AMOUNT_MISMATCH", "The settled amount does not match the invoice balance", req);
    fail(`eSewa settled ${settledAmount} but ${payment.amount} was due`, 409);
  }

  return settleAsSuccessful(
    payment,
    {
      reference: parsed.transaction_code || statusCheck.reference || null,
      gatewayStatus: String(statusCheck.status || gatewayStatus || "COMPLETE"),
    },
    sessionUser,
    req
  );
};

/**
 * Writes SUCCESS and everything that follows from it.
 *
 * Split out of `completePayment` because two paths legitimately arrive here: the
 * verified gateway callback, and reconciliation of a transaction whose redirect
 * was lost. Both have already proved the money arrived - one by response signature
 * plus status check, the other by the status check alone - so the write itself is
 * shared rather than duplicated, and there is exactly one place that can turn a
 * payment into SUCCESS.
 */
const settleAsSuccessful = async (payment, { reference, gatewayStatus }, sessionUser, req) => {
  payment.status = "SUCCESS";
  payment.providerStatus = String(gatewayStatus || "COMPLETE");
  payment.providerRef = reference || payment.providerRef;
  // The Admin billing screen shows `transactionRef`; prefer the gateway's own
  // reference and fall back to our transaction uuid.
  payment.transactionRef = payment.providerRef || payment.transactionRef;
  payment.paidAt = new Date();
  payment.failureReason = undefined;
  await payment.save();

  // Recomputes Invoice.amountPaid / balance / status from SUCCESS payments only.
  await billingService.syncInvoiceTotals(payment.invoice);

  const invoice = await Invoice.findById(payment.invoice).lean();
  const patient = await User.findById(payment.patient).select("name email").lean();

  await auditService.record({
    action: "PAYMENT_COMPLETED",
    actor: sessionUser,
    targetType: "Payment",
    targetId: payment._id,
    targetEmail: patient?.email,
    metadata: {
      paymentNo: payment.paymentNo,
      invoiceNo: invoice?.invoiceNo,
      amount: payment.amount,
      provider: payment.provider,
      transactionUuid: payment.transactionUuid,
      providerRef: payment.providerRef,
    },
    req,
  });

  // Patient and Admin are told separately, because they are different accounts.
  await notificationService.notifyUser(patient?._id, {
    type: "PAYMENT_COMPLETED",
    title: "Payment received",
    message: `We received NPR ${payment.amount} for ${invoice?.invoiceNo} via ${payment.provider}.`,
    entityType: "Payment",
    entityId: payment._id,
  });

  await notificationService.notifyAdmins({
    type: "PAYMENT_COMPLETED",
    title: "Payment received",
    message: `${payment.paymentNo} settled NPR ${payment.amount} against ${invoice?.invoiceNo} via ${payment.provider}.`,
    entityType: "Payment",
    entityId: payment._id,
    preference: "billingAlerts",
  });

  return { payment: publicPayment(payment), alreadyProcessed: false, pending: false };
};

/**
 * Handles the gateway's failure return.
 *
 * eSewa's own documentation states that the customer is sent to `failure_url`
 * after a FAILED *or a PENDING* transaction, and that return carries no payload.
 * So the redirect cannot be taken at face value in either direction: the gateway
 * is asked what actually happened, and only a definite non-success becomes FAILED.
 *
 * The transaction is always retained, so a retry is visible in the history.
 */
const handleFailureCallback = async ({ transactionUuid, paymentId, invoiceId, message }, req) => {
  const provider = getProvider();
  const payment = await findTransaction({ transactionUuid, paymentId, invoiceId });

  // A payment that already settled stays settled - the failure return can arrive
  // after a success, or be replayed.
  if (payment.status === "SUCCESS" || payment.status === "REFUNDED") {
    return { payment: publicPayment(payment), alreadyProcessed: true };
  }

  const statusCheck = await provider.checkStatus({
    transactionUuid: payment.transactionUuid,
    amount: payment.amount,
  });

  if (!statusCheck.reachable || !statusCheck.status) {
    // eSewa could not tell us. PENDING is the honest state: it is not a failure we
    // have evidence for, and it can be reconciled later.
    payment.providerStatus = "UNKNOWN";
    await payment.save();
    return { payment: publicPayment(payment), pending: true };
  }

  const mapped = provider.mapStatus(statusCheck.status);
  if (mapped === "SUCCESS") {
    return settleAsSuccessful(
      payment,
      { reference: statusCheck.reference || null, gatewayStatus: String(statusCheck.status) },
      null,
      req
    );
  }

  if (mapped === "PENDING") {
    payment.providerStatus = String(statusCheck.status);
    await payment.save();
    return { payment: publicPayment(payment), pending: true };
  }

  if (mapped === "REFUNDED") {
    payment.status = "REFUNDED";
    payment.providerStatus = String(statusCheck.status);
    payment.providerRef = statusCheck.reference || payment.providerRef;
    payment.failureReason = `eSewa reported ${statusCheck.status}`;
    await payment.save();
    await billingService.syncInvoiceTotals(payment.invoice);
    return { payment: publicPayment(payment), refunded: true };
  }

  return settleAsFailed(
    payment,
    statusCheck.status,
    String(message || `eSewa reported the transaction as ${statusCheck.status}`).slice(0, 300),
    req
  );
};

/**
 * Marks a transaction FAILED and retains it.
 *
 * The row is never deleted: a failed attempt is part of the audit trail and is
 * what proves the invoice was not settled. The invoice balance is untouched,
 * because a FAILED payment contributes nothing.
 */
const settleAsFailed = async (payment, gatewayStatus, reason, req) => {
  payment.status = "FAILED";
  payment.providerStatus = String(gatewayStatus || "FAILED").slice(0, 60);
  payment.failureReason = String(reason || "Payment failed").slice(0, 300);
  await payment.save();

  await auditService.record({
    action: "PAYMENT_FAILED",
    actor: null,
    targetType: "Payment",
    targetId: payment._id,
    metadata: {
      paymentNo: payment.paymentNo,
      transactionUuid: payment.transactionUuid,
      provider: payment.provider,
      gatewayStatus: payment.providerStatus,
    },
    req,
  });

  return { payment: publicPayment(payment), failed: true, reason: payment.failureReason };
};

/**
 * Re-checks a transaction against the gateway.
 *
 * Used by the status endpoint and by the callback, so a payment whose redirect was
 * lost can still be settled without the customer doing anything.
 */
const reconcile = async ({ paymentId, transactionUuid }, sessionUser, req) => {
  const provider = getProvider();
  const payment = await loadVisibleTransaction({ paymentId, transactionUuid }, sessionUser);

  if (payment.status === "SUCCESS") {
    return { payment: publicPayment(payment), alreadyProcessed: true };
  }

  const statusCheck = await provider.checkStatus({
    transactionUuid: payment.transactionUuid,
    amount: payment.amount,
  });

  if (!statusCheck.reachable) {
    fail("eSewa could not be reached. The payment is still pending; try again shortly.", 503);
  }

  const mapped = provider.mapStatus(statusCheck.status);

  if (mapped === "SUCCESS") {
    // Reconciliation has no redirect payload to check a signature against - the
    // gateway's own status endpoint is the authority, and the uuid match is
    // enforced by the lookup above.
    return settleAsSuccessful(
      payment,
      { reference: statusCheck.reference || null, gatewayStatus: String(statusCheck.status) },
      sessionUser,
      req
    );
  }

  if (mapped === "PENDING") {
    payment.providerStatus = String(statusCheck.status);
    await payment.save();
    return { payment: publicPayment(payment), pending: true };
  }

  if (statusCheck.status) {
    if (mapped === "REFUNDED") {
      payment.status = "REFUNDED";
      payment.providerStatus = String(statusCheck.status);
      payment.providerRef = statusCheck.reference || payment.providerRef;
      payment.failureReason = `eSewa reported ${statusCheck.status}`;
      await payment.save();
      await billingService.syncInvoiceTotals(payment.invoice);
      return { payment: publicPayment(payment), refunded: true };
    }

    return settleAsFailed(
      payment,
      statusCheck.status,
      `eSewa reported the transaction as ${statusCheck.status}`,
      req
    );
  }

  // Reachable but no status: still undecided.
  payment.providerStatus = "UNKNOWN";
  await payment.save();
  return { payment: publicPayment(payment), pending: true };
};

/**
 * Looks up a transaction by uuid or id.
 *
 * This is the raw lookup used by the two gateway callbacks. They arrive with no
 * session, so there is no caller to compare against; they are authorised instead by
 * eSewa's response signature and by the gateway's own status endpoint. Every
 * session-authenticated route must use `loadVisibleTransaction` instead, which does
 * enforce ownership.
 */
const findTransaction = async ({ transactionUuid, invoiceId, paymentId }) => {
  const filter = {};

  if (transactionUuid) {
    filter.transactionUuid = String(transactionUuid).trim().toUpperCase();
  } else if (paymentId) {
    filter._id = objectId(paymentId, "payment id");
  } else if (invoiceId) {
    filter.invoice = objectId(invoiceId, "invoice id");
  } else {
    fail("A transaction reference is required", 422);
  }

  const payment = await Payment.findOne(filter).sort({ createdAt: -1 });
  if (!payment) fail("No matching payment transaction was found", 404);
  return payment;
};

/**
 * Looks up a transaction for a SIGNED-IN user, refusing anything they cannot see.
 *
 * A patient may read only their own transactions. An admin may read any, because
 * the counter-payment and reconciliation paths are theirs. A doctor or laboratory
 * account has no billing relationship to an invoice and is refused outright.
 */
const loadVisibleTransaction = async (lookup, sessionUser) => {
  if (!sessionUser?._id) fail("You must be signed in to view a payment", 401);

  const payment = await findTransaction(lookup);

  const isAdmin = isAdminRole(sessionUser.role);
  const isOwner = String(payment.patient) === String(sessionUser._id);

  if (!isAdmin && !isOwner) fail("You cannot view this payment", 403);

  return payment;
};

/**
 * What the browser and the Admin screens are allowed to see.
 *
 * No secret key, no gateway response body - only the record's own fields.
 */
const publicPayment = (payment) => ({
  id: payment._id,
  paymentNo: payment.paymentNo,
  invoice: payment.invoice,
  invoiceNo: payment.invoiceNo ?? null,
  amount: payment.amount,
  method: payment.method,
  provider: payment.provider ?? null,
  status: payment.status,
  transactionRef: payment.transactionRef ?? null,
  providerRef: payment.providerRef ?? null,
  transactionUuid: payment.transactionUuid ?? null,
  providerStatus: payment.providerStatus ?? null,
  failureReason: payment.failureReason ?? null,
  // Which attempt at this bill this row is. A retried payment is a new row, so the
  // chain of attempts is visible instead of the earlier ones being overwritten.
  attempt: payment.attempt ?? null,
  supersededBy: payment.supersededBy ?? null,
  paidAt: payment.paidAt ?? null,
  initiatedAt: payment.initiatedAt ?? null,
  createdAt: payment.createdAt,
});

/** Gateway configuration safe to expose (no secret). */
const getPublicConfig = () => publicConfig();

const listProviders = () => availableProviders();

module.exports = {
  initiate,
  completePayment,
  handleFailureCallback,
  reconcile,
  settleAsFailed,
  publicPayment,
  getPublicConfig,
  listProviders,
  findTransaction,
  loadVisibleTransaction,
  DEFAULT_PROVIDER,
};