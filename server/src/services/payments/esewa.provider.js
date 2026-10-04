const crypto = require("crypto");
const env = require("../../config/env");

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
 *   2. After payment the customer is redirected to `success_url` / `failure_url`.
 *      The success redirect carries `?data=<base64 JSON>`.
 *   3. The transaction status can also be queried out-of-band with the
 *      transaction uuid, because a redirect can be lost.
 *
 * NOTHING here trusts the browser: the amount is re-read from the database by the
 * caller, the response signature is verified here, and the caller independently
 * confirms the status with eSewa before marking a payment settled.
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
 * Transaction uuid. eSewa requires alphanumeric and hyphens only, so the
 * timestamp parts are unpadded and a separator is used rather than a colon.
 *
 * Shape: `HHMMSS-YYYYMMDD-<counter><random>` - readable in the gateway dashboard
 * and unique across concurrent requests.
 */
const buildTransactionUuid = (invoiceNo) => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const day = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const unique = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
  const prefix = String(invoiceNo || "PAY").replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();
  return `${prefix}-${time}-${day}-${unique}`;
};

/**
 * Creates the signed field set for the redirect form.
 *
 * The returned `fields` are posted to `endpoint` as a real HTML form; the browser
 * never computes the signature and never sees the secret.
 */
const createPaymentFields = ({ amount, transactionUuid, invoiceNo }) => {
  if (!isConfigured()) {
    fail("eSewa payment is not configured on this server. Set ESEWA_PRODUCT_CODE and ESEWA_SECRET_KEY.", 503);
  }

  const totalAmount = formatAmount(amount);
  const productCode = env.esewa.productCode;
  const message = buildMessage([
    ["total_amount", totalAmount],
    ["transaction_uuid", transactionUuid],
    ["product_code", productCode],
  ]);

  return {
    endpoint: endpoints().form,
    method: "POST",
    signature: hmacBase64(message, env.esewa.secretKey),
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
      signature: hmacBase64(message, env.esewa.secretKey),
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
    return { reachable: false, status: null, reference: null, error: error.message };
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return { reachable: true, status: null, reference: null, error: text.slice(0, 200) };
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
    };
  }

  return {
    reachable: true,
    status: payload.status,
    reference: payload.refId || null,
    reportedAmount: Number(payload.totalAmount),
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
  mapStatus,
  formatAmount,
  SIGNED_FIELDS,
  hmacBase64,
  rawLiteral,
  // `endpoints` is part of the provider contract; the callback URLs a merchant
  // actually configured may differ from the documented presets.
  getEndpoints: endpoints,
};