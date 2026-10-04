const paymentService = require("../services/payment.service");
const response = require("../utils/response");
const env = require("../config/env");

/**
 * Payment module controllers.
 *
 * Payment is a shared module rather than part of one role: a Patient pays their own
 * invoice, and an Admin records or takes payment at the desk against any invoice.
 * Both go through the same service, so the two screens cannot drift apart.
 *
 * The gateway secret never appears in a response from any handler here. The only
 * thing handed to the browser is the signed form fields, which are exactly what
 * the browser must POST to eSewa.
 */

const actor = (req) => req.user;

/**
 * Where the customer's browser is sent once the gateway flow is resolved.
 *
 * The callback lands on the BACKEND so the settlement happens server-side, then the
 * browser is forwarded to the React result page. The customer never sees a raw
 * gateway response, and the SPA never has to be trusted with one.
 */
const resultUrl = (path, params = {}) => {
  const url = new URL(path, env.appUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, String(value));
  }
  return url.toString();
};

/**
 * Returns the settled state to a browser, or forwards it to the React result page.
 *
 * The callbacks are browser navigations from eSewa, so the usual answer is a 302.
 * A JSON body is still returned when the caller asks for JSON, which keeps the
 * endpoint testable and usable from a non-browser client.
 */
const respond = (req, res, payload, message, redirectTo) => {
  if (req.method === "GET" || String(req.headers.accept || "").includes("text/html")) {
    return res.redirect(302, redirectTo);
  }
  return response.success(res, payload, 200, message);
};

/** Which gateways are usable right now, and their callback URLs. No secret. */
const getConfig = async (req, res, next) => {
  try {
    return response.success(
      res,
      { ...paymentService.getPublicConfig(), available: paymentService.listProviders() },
      200,
      "Payment configuration loaded"
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * Starts an online payment and returns the signed form to submit to eSewa.
 *
 * The client builds a real HTML form from `checkout.fields` and submits it. It
 * cannot sign anything itself, and nothing here tells it how.
 */
const initiate = async (req, res, next) => {
  try {
    const result = await paymentService.initiate(
      {
        invoiceId: req.body?.invoiceId || req.params.invoiceId,
        provider: req.body?.provider,
        amount: req.body?.amount,
      },
      actor(req),
      req
    );

    return response.success(res, result, 201, result.reused ? "Existing payment resumed" : "Payment initiated");
  } catch (error) {
    return next(error);
  }
};

/**
 * eSewa's success return.
 *
 * The transaction is NOT trusted because the browser arrived here. The service
 * verifies the gateway signature and then confirms the status with eSewa before
 * anything is marked paid. A failure to verify returns an error and the invoice
 * stays unpaid.
 */
const success = async (req, res, next) => {
  try {
    const result = await paymentService.completePayment(
      {
        transactionUuid: req.body?.transaction_uuid || req.query?.transaction_uuid,
        invoiceId: req.body?.invoiceId,
        paymentId: req.body?.paymentId,
        // `data` is the base64 envelope eSewa appends to the return URL.
        rawGatewayPayload: req.body?.data || req.query?.data,
      },
      actor(req),
      req
    );

    // A verified-but-still-undecided transaction is forwarded to the result page
    // too; it reads "pending", not "paid", because `settled` is false.
    const settled = result.payment?.status === "SUCCESS";

    return respond(
      req,
      res,
      result,
      settled ? "Payment confirmed" : "Payment is still processing",
      resultUrl("/payments/result", {
        payment: result.payment?.paymentNo,
        status: result.payment?.status,
        invoice: result.payment?.invoiceNo,
      })
    );
  } catch (error) {
    // Verification failed or could not complete. The customer is told so and the
    // invoice keeps its balance - this path must never render as a success.
    if (req.method === "GET" || String(req.headers.accept || "").includes("text/html")) {
      return res.redirect(
        302,
        resultUrl("/payments/result", {
          status: "FAILED",
          reason: error.message,
        })
      );
    }
    return next(error);
  }
};

/**
 * eSewa's failure return.
 *
 * Does NOT assume failure: eSewa redirects the customer here for a PENDING
 * transaction as well as a failed one, and carries no payload either way. The
 * service asks eSewa what actually happened. The invoice keeps its balance, the
 * transaction is retained, and a retry is allowed.
 */
const failure = async (req, res, next) => {
  try {
    const result = await paymentService.handleFailureCallback(
      {
        transactionUuid: req.body?.transaction_uuid || req.query?.transaction_uuid,
        paymentId: req.body?.paymentId,
        invoiceId: req.body?.invoiceId,
        message: req.body?.message || req.query?.message,
      },
      req
    );

    return respond(
      req,
      res,
      result,
      "Payment was not completed",
      resultUrl("/payments/result", {
        payment: result.payment?.paymentNo,
        status: result.payment?.status,
        invoice: result.payment?.invoiceNo,
        reason: result.payment?.failureReason,
      })
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * Re-checks a transaction with eSewa.
 *
 * Serves the "I never got redirected back" case: a pending transaction whose
 * return trip was lost can still be settled from the gateway's own answer.
 */
const verify = async (req, res, next) => {
  try {
    const result = await paymentService.reconcile(
      {
        paymentId: req.body?.paymentId || req.params.paymentId,
        transactionUuid: req.body?.transactionUuid || req.query?.transactionUuid,
      },
      actor(req),
      req
    );

    return response.success(res, result, 200, "Payment status verified");
  } catch (error) {
    return next(error);
  }
};

/** Current stored state of one transaction, for a refresh or a history screen. */
const getStatus = async (req, res, next) => {
  try {
    const payment = await paymentService.loadVisibleTransaction(
      { paymentId: req.params.paymentId },
      actor(req)
    );

    return response.success(
      res,
      paymentService.publicPayment(payment),
      200,
      "Payment status loaded"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = { getConfig, initiate, success, failure, verify, getStatus };