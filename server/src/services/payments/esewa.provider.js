const crypto = require("crypto");
const env = require("../../config/env");
const logger = require("../../utils/logger");

/**
 * eSewa ePay v2 provider.
 *
 * Implements the `PaymentProvider` contract used by `payment.service.js`. Every
 * eSewa-specific detail - the signed field list, the form field names, the base64
 * response envelope, the status-check endpoint - lives in this file and nowhere
 * else, so swapping or adding a gateway does not touch the payment flow.
 *
 * Spec implemented (eSewa "ePay V2", form integration):
 *
 *   1. The merchant POSTs a signed form to the ePay endpoint. The signature is
 *      HMAC-SHA256, base64 encoded, over exactly:
 *          total_amount=<v>,transaction_uuid=<v>,product_code=<v>
 *      The order is fixed by eSewa and is echoed to the gateway in
 *      `signed_field_names`, so it must never be reordered.
 *   2. `transaction_uuid` is a PER-ATTEMPT merchant reference. eSewa accepts each
 *      uuid exactly once for the life of the merchant account and answers a second
 *      submission of the same uuid with
 *      `{"error_message":"Duplicate transaction UUID.","code":0}`. So a uuid is
 *      minted fresh for every attempt (see `buildTransactionUuid`) and is never
 *      reused, resumed or derived from the invoice id alone.
 *   3. After payment the customer is redirected to `success_url` / `failure_url`.
 *      The success redirect carries `?data=<base64 JSON>`.
 *   4. The transaction status can also be queried out-of-band with the
 *      transaction uuid, because a redirect can be lost.
 *
 * NOTHING here trusts the browser: the amount is re-read from the database by the
 * caller, the response signature is verified here, and the caller independently
 * confirms the status with eSewa before marking a payment settled. The secret key
 * is read only inside `createPaymentFields` and `verifyResponseSignature`; it is
 * never returned to a caller and never written to a log.
 */

const PROVIDER = "ESEWA";

/**
 * Documented endpoints. Selected by ESEWA_ENVIRONMENT, and individually
 * overridable because eSewa publishes more than one URL per environment and a
 * merchant account is provisioned for one of them.
 *
 * Note the status-check host differs from the form host (`uat.` vs `rc-epay.`)
 * in eSewa's own documentation, so the two are listed separately rather than
 * derived from one base.
 */
const ENDPOINTS = {
  production: {
    form: "https://epay.esewa.com.np/api/epay/main/v2/form",
    statusCheck: "https://epay.esewa.com.np/api/epay/transaction/status/",
  },
  uat: {
    form: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
    statusCheck: "https://uat.esewa.com.np/api/epay/transaction/status/",
  },
};

/** The exact field order eSewa requires. Signing any other order is rejected. */
const SIGNED_FIELDS = ["total_amount", "transaction_uuid", "product_code"];

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const isConfigured = () =>
  Boolean(env.esewa.productCode && env.esewa.secretKey && env.esewa.environment);

const endpoints = () => {
  const preset = ENDPOINTS[env.esewa.environment] || ENDPOINTS.uat;
  return {
    form: env.esewa.formUrl || preset.form,
    statusCheck: env.esewa.statusCheckUrl || preset.statusCheck,
  };
};

/**
 * Base64-encoded HMAC-SHA256, the output format eSewa specifies.
 *
 * `message` must already be the exact signed string; this function does no
 * formatting so it behaves identically for the request and the response.
 */
const hmacBase64 = (message, secret) =>
  crypto.createHmac("sha256", Buffer.from(String(secret), "utf8")).update(Buffer.from(String(message), "utf8")).digest("base64");

/**
 * Money as eSewa wants to see it: two decimal places, no thousands separator.
 *
 * `"1250.5"` and `"1250.50"` are different strings and therefore produce different
 * signatures. eSewa compares the signed string against the submitted form field,
 * so the value signed here must be the identical string submitted as
 * `total_amount`. Fixed at 2dp for that reason.
 */
const formatAmount = (amount) => Number(amount || 0).toFixed(2);

/** Builds the signed message for the given field/value pairs, in the given order. */
const buildMessage = (pairs) => pairs.map(([field, value]) => `${field}=${value}`).join(",");

/**
 * Recovers the *literal* text of a field from the decoded JSON body.
 *
 * This is the subtle part of the eSewa integration. The gateway signs the exact
 * characters it sent, and it sends amounts as JSON numbers: `"total_amount": 1000.0`.
 * Parsing that to a JS number and re-serialising produces "1000", which is a
 * different string and therefore a different HMAC - so verification would fail on
 * payments eSewa genuinely completed. The signed literal is recovered from the raw
 * text instead of being reconstructed from the parsed value.
 *
 * Returns null when the field is absent or not a scalar.
 */
const rawLiteral = (json, field) => {
  const key = `"${field}"`;
  const start = json.indexOf(key);
  if (start === -1) return null;

  let index = start + key.length;
  while (index < json.length && /\s/.test(json[index])) index += 1;
  if (json[index] !== ":") return null;
  index += 1;
  while (index < json.length && /\s/.test(json[index])) index += 1;

  // String value: take the contents without unescaping so the signed bytes match.
  if (json[index] === '"') {
    const end = json.indexOf('"', index + 1);
    return end === -1 ? null : json.slice(index + 1, end);
  }

  // Number / boolean / null: consume up to the next structural character.
  let end = index;
  while (end < json.length && !",}] \t\r\n".includes(json[end])) end += 1;
  const literal = json.slice(index, end);
  return literal.length ? literal : null;
};

/** The gateway status strings that mean "money has moved". */
const SUCCESS_STATUSES = new Set(["COMPLETE"]);

/** Statuses where eSewa has not decided yet - NOT a failure. */
const PENDING_STATUSES = new Set(["PENDING", "AMBIGUOUS"]);

/** Settled, then handed back to the customer. */
const REFUNDED_STATUSES = new Set(["FULL_REFUND", "PARTIAL_REFUND"]);

/**
 * Maps a gateway status onto this project's `Payment.status` enum.
 *
 * Anything unrecognised is treated as FAILED rather than PENDING: a status we do
 * not understand must never be allowed to settle money. `AMBIGUOUS` ("payment is
 * at hult state" in eSewa's own wording) stays PENDING because it means the
 * gateway itself does not know yet.
 */
const mapStatus = (gatewayStatus) => {
  const value = String(gatewayStatus || "").trim().toUpperCase();
  if (SUCCESS_STATUSES.has(value)) return "SUCCESS";
  if (PENDING_STATUSES.has(value)) return "PENDING";
  if (REFUNDED_STATUSES.has(value)) return "REFUNDED";
  return "FAILED";
};

/**
 * Mints a NEW transaction uuid for one payment attempt.
 *
 * eSewa treats `transaction_uuid` as a single-use merchant reference: submitting
 * the same uuid twice is rejected with
 * `{"error_message":"Duplicate transaction UUID.","code":0}`. That is why this
 * runs on every attempt and never returns a value it was asked to avoid - a uuid
 * is never resumed, and the invoice id is only a readable prefix, never the whole
 * value. Resubmitting a uuid that eSewa has already seen is the bug this exists to
 * prevent, so the guarantee is enforced here and re-checked by the unique index on
 * `Payment.transactionUuid`.
 *
 * Charset is alphanumeric plus hyphens, as eSewa requires, so the timestamp parts
 * are unpadded and a separator is used rather than a colon.
 *
 * Shape: `<billId>-HHMMSS-YYYYMMDD-<clock36><random>` - readable in the eSewa
 * dashboard and unique across concurrent requests.
 *
 * @param {string} invoiceNo   readable prefix only; never used on its own.
 * @param {object} [options]
 * @param {string|string[]} [options.avoid] uuid(s) this attempt must not reuse.
 * @returns {string}
 */
const buildTransactionUuid = (invoiceNo, { avoid } = {}) => {
  const forbidden = new Set(
    (Array.isArray(avoid) ? avoid : [avoid])
      .filter(Boolean)
      .map((value) => String(value).toUpperCase())
  );

  // The invoice id contributes a prefix, never the identity of the transaction.
  const prefix = String(invoiceNo || "PAY").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase() || "PAY";

  // 8 random uuids colliding is not a real possibility, but a uuid that is already
  // in use must never be returned - so the loop is bounded and the caller is told
  // rather than handed a duplicate.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    const day = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
    const clock = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();

    const candidate = `${prefix}-${time}-${day}-${clock}${random}`;
    if (!forbidden.has(candidate)) return candidate;
  }

  return fail("Could not generate a unique eSewa transaction uuid. Please try again.", 503);
};

/**
 * Creates the signed field set for the redirect form.
 *
 * Called once per attempt with that attempt's freshly minted `transactionUuid`, so
 * the signature is always recomputed for the uuid actually being submitted. Two
 * attempts against the same invoice therefore carry two different uuids and two
 * different signatures - eSewa rejects a repeated uuid outright.
 *
 * `signed_field_names` must be the exact comma-joined list that was signed, in the
 * same order, or eSewa recomputes a different HMAC and rejects the request.
 *
 * The returned `fields` are posted to `endpoint` as a real HTML form. This is the
 * only place the secret is read, it is used solely as the HMAC key, and neither the
 * key nor anything derived from it other than `signature` is ever returned.
 */
const createPaymentFields = ({ amount, transactionUuid, invoiceNo }) => {
  if (!isConfigured()) {
    fail("eSewa payment is not configured on this server. Set ESEWA_PRODUCT_CODE and ESEWA_SECRET_KEY.", 503);
  }
  if (!transactionUuid) {
    fail("A transaction uuid is required to start an eSewa payment", 422);
  }

  const totalAmount = formatAmount(amount);
  const productCode = env.esewa.productCode;
  const message = buildMessage([
    ["total_amount", totalAmount],
    ["transaction_uuid", transactionUuid],
    ["product_code", productCode],
  ]);
  const signature = hmacBase64(message, env.esewa.secretKey);

  return {
    endpoint: endpoints().form,
    method: "POST",
    signature,
    fields: {
      amount: totalAmount,
      tax_amount: formatAmount(0),
      product_service_charge: formatAmount(0),
      product_delivery_charge: formatAmount(0),
      total_amount: totalAmount,
      transaction_uuid: transactionUuid,
      product_code: productCode,
      success_url: env.esewa.successUrl,
      failure_url: env.esewa.failureUrl,
      signed_field_names: SIGNED_FIELDS.join(","),
      signature,
    },
  };
};

/**
 * Verifies the signature on a decoded eSewa success response.
 *
 * The gateway names the fields it signed in `signed_field_names` and signs them in
 * that order, so the response is re-signed from its own list rather than from our
 * fixed request list.
 */
const verifyResponseSignature = (decodedJson) => {
  const signedFieldNames = rawLiteral(decodedJson, "signed_field_names");
  const signature = rawLiteral(decodedJson, "signature");
  if (!signedFieldNames || !signature) {
    return { valid: false, reason: "The eSewa response did not include a signature" };
  }

  const pairs = signedFieldNames.split(",").map((field) => [field, rawLiteral(decodedJson, field)]);
  const missing = pairs.filter(([, value]) => value === null).map(([field]) => field);
  if (missing.length) {
    return { valid: false, reason: `The eSewa response is missing signed field(s): ${missing.join(", ")}` };
  }

  const expected = hmacBase64(buildMessage(pairs), env.esewa.secretKey);

  // Constant-time compare: a byte-by-byte early exit would leak the signature.
  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));

  return valid ? { valid: true } : { valid: false, reason: "The eSewa response signature did not match" };
};

/**
 * Decodes the `?data=<base64>` envelope eSewa redirects back with.
 *
 * Returns the parsed payload plus the raw decoded text, because the signature has
 * to be checked against the literal field text (see `rawLiteral`).
 */
const decodeCallbackData = (data) => {
  if (!data || typeof data !== "string") {
    fail("The eSewa response did not include payment data", 422);
  }

  let decoded;
  try {
    // eSewa uses standard base64; padding is tolerated because some gateways trim it.
    decoded = Buffer.from(data, "base64").toString("utf8");
  } catch {
    fail("The eSewa payment data could not be decoded", 422);
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    fail("The eSewa payment data was not in the expected format", 422);
  }

  return { parsed, raw: decoded };
};

/**
 * Logs the gateway's own account of a callback, verbatim.
 *
 * "The patient says eSewa said no" is otherwise unanswerable after the fact: the
 * raw response exists only in the request that produced it. So the full decoded
 * body is written to the log at every stage - verified, rejected and failed - with
 * the outcome alongside it, and the payment context attached by the caller.
 *
 * The secret key is never in this payload (it is a response, not a request), so
 * the log is safe to keep. `signature` IS present and is left in: it is a public
 * value, and redacting it would make the log useless for diagnosing a signature
 * mismatch, which is exactly what it is for.
 *
 * @param {string} stage    where in the flow this happened, e.g. "success-callback".
 * @param {object} context  `{ transactionUuid, paymentNo, invoiceNo }`.
 * @param {string} raw      the decoded response text.
 */
const logGatewayResponse = (stage, context = {}, raw) => {
  logger.info(
    `[esewa] ${stage} ${JSON.stringify({
      transactionUuid: context.transactionUuid ?? null,
      paymentNo: context.paymentNo ?? null,
      invoiceNo: context.invoiceNo ?? null,
    })} raw=${String(raw ?? "").slice(0, 4000)}`
  );
};

/**
 * Asks eSewa for the authoritative status of a transaction.
 *
 * This is the check that makes a redirect unnecessary as proof: the payment is
 * only settled from eSewa's own answer about the transaction, so a missing,
 * duplicated or forged redirect cannot settle an invoice.
 *
 * eSewa's documented status API is a GET keyed by product code, total amount and
 * transaction uuid, and answers with `{ pid, scd, totalAmount, status, refId }`.
 * The amount is included because eSewa's own endpoint is keyed by it, not because
 * we trust it - it is read back from the stored payment by the caller.
 *
 * The FULL response body is logged on every call, because this is the only place
 * the gateway's own account of the transaction exists, and a support question
 * ("what did eSewa say about this transaction?") is otherwise unanswerable. The
 * request carries the product code and uuid only - never the secret key - so this
 * log cannot leak it.
 */
const checkStatus = async ({ transactionUuid, amount }) => {
  if (!isConfigured()) {
    fail("eSewa payment is not configured on this server", 503);
  }

  const url = new URL(endpoints().statusCheck);
  url.searchParams.set("product_code", env.esewa.productCode);
  url.searchParams.set("total_amount", formatAmount(amount));
  url.searchParams.set("transaction_uuid", transactionUuid);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    // A network problem is NOT a failed payment. It is reported as unreachable so
    // the transaction stays PENDING and can be reconciled later.
    logger.error(
      `[esewa] status check unreachable uuid=${transactionUuid} amount=${formatAmount(amount)} reason=${error.message}`
    );
    return { reachable: false, status: null, reference: null, error: error.message, raw: null };
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  // The full gateway response, verbatim, on every code path.
  logger.info(
    `[esewa] status check uuid=${transactionUuid} amount=${formatAmount(amount)} http=${response.status} body=${text.slice(0, 2000)}`
  );

  if (!response.ok) {
    return { reachable: true, status: null, reference: null, error: text.slice(0, 200), raw: payload };
  }

  // eSewa signals "service unavailable" with `{"code":0,"error_message":...}` and
  // a 200 status. That is not an answer about the transaction, so it must not be
  // read as "failed".
  if (!payload || payload.code === 0 || !payload.status) {
    return {
      reachable: true,
      status: null,
      reference: null,
      error: payload?.error_message || "eSewa returned no transaction status",
      raw: payload,
    };
  }

  return {
    reachable: true,
    status: payload.status,
    reference: payload.refId || null,
    reportedAmount: Number(payload.totalAmount),
    raw: payload,
  };
};

module.exports = {
  provider: PROVIDER,
  isConfigured,
  endpoints,
  createPaymentFields,
  decodeCallbackData,
  verifyResponseSignature,
  checkStatus,
  buildTransactionUuid,
  logGatewayResponse,
  mapStatus,
  formatAmount,
  SIGNED_FIELDS,
  hmacBase64,
  rawLiteral,
  // `endpoints` is part of the provider contract; the callback URLs a merchant
  // actually configured may differ from the documented presets.
  getEndpoints: endpoints,
};