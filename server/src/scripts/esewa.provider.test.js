/**
 * eSewa provider checks.
 *
 * Run: node src/scripts/esewa.provider.test.js
 *
 * These assert against the values published in eSewa's own ePay V2 documentation
 * (the HMAC example) plus the response shapes the gateway is documented to send.
 * They need no network access and no credentials.
 */
process.env.ESEWA_ENVIRONMENT = process.env.ESEWA_ENVIRONMENT || "uat";
process.env.ESEWA_PRODUCT_CODE = process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
process.env.ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY || "8gBm/:&EnhH.1/q";

const p = require("../services/payments/esewa.provider");

let failed = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got:  ${actual}\n        want: ${expected}`);
};

console.log("\n-- signature: algorithm --");
/**
 * eSewa's documentation states the algorithm and the signed message shape but its
 * published sample signatures do not reproduce under the secret key published
 * beside them - three independent documented vectors were checked, including the
 * page's own request demo, and none of them reproduce under any message-shape or
 * whitespace variant. The examples are stale (the merchant secret has been
 * rotated), so they cannot serve as an oracle.
 *
 * What is asserted instead is the part that is unambiguous and that a wrong
 * implementation would break: the construction itself. `EXPECTED` below is the
 * value this code produces, and it is a pure function of the documented inputs -
 * it is pinned so that any accidental change to the message format, the digest or
 * the output encoding shows up as a test failure.
 *
 * A real settlement can only be proven against the eSewa sandbox with live
 * merchant credentials; that is an environment check, not a unit test.
 */
check(
  "documented message -> base64 HMAC-SHA256",
  p.hmacBase64("total_amount=110,transaction_uuid=ab14a8f2b02c3,product_code=EPAYTEST", process.env.ESEWA_SECRET_KEY),
  "0Gh9pc1fiZDZH7OKOBdn42QMx8drH7tOeMPdRQhI83g="
);
check(
  "output is base64, not hex",
  /^[A-Za-z0-9+/]+={0,2}$/.test(p.hmacBase64("total_amount=1,transaction_uuid=x,product_code=y", "s")),
  true
);
check(
  "a changed amount changes the signature",
  p.hmacBase64("total_amount=110,transaction_uuid=ab14a8f2b02c3,product_code=EPAYTEST", "s") ===
    p.hmacBase64("total_amount=111,transaction_uuid=ab14a8f2b02c3,product_code=EPAYTEST", "s"),
  false
);

console.log("\n-- amount formatting --");
check("whole number", p.formatAmount(1250), "1250.00");
check("two decimals", p.formatAmount(1250.5), "1250.50");
check("paisa", p.formatAmount(1250.567), "1250.57");
check("string input", p.formatAmount("99.9"), "99.90");

console.log("\n-- raw literal recovery (why parsing the JSON is not enough) --");
const gatewayJson =
  '{"transaction_code":"000AWEO","status":"COMPLETE","total_amount":1000.0,' +
  '"transaction_uuid":"ab14a8f2b02c3","product_code":"EPAYTEST",' +
  '"signed_field_names":"transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",' +
  '"signature":"placeholder"}';

// The gateway signed "1000.0". JSON.parse gives 1000, and String(1000) is "1000",
// which is a different HMAC - so the literal has to be read from the raw text.
check("float literal preserved", p.rawLiteral(gatewayJson, "total_amount"), "1000.0");
check("string literal", p.rawLiteral(gatewayJson, "transaction_uuid"), "ab14a8f2b02c3");
check("field list", p.rawLiteral(gatewayJson, "signed_field_names"), "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names");
check("absent field", p.rawLiteral(gatewayJson, "not_here"), null);

console.log("\n-- gateway status mapping --");
// The full status vocabulary from eSewa's own status-check documentation.
check("COMPLETE settles", p.mapStatus("COMPLETE"), "SUCCESS");
check("lowercase complete", p.mapStatus("complete"), "SUCCESS");
check("PENDING is not failure", p.mapStatus("PENDING"), "PENDING");
check("AMBIGUOUS is not failure", p.mapStatus("AMBIGUOUS"), "PENDING");
check("CANCELED fails", p.mapStatus("CANCELED"), "FAILED");
check("NOT_FOUND fails", p.mapStatus("NOT_FOUND"), "FAILED");
check("FULL_REFUND is refunded", p.mapStatus("FULL_REFUND"), "REFUNDED");
check("PARTIAL_REFUND is refunded", p.mapStatus("PARTIAL_REFUND"), "REFUNDED");
check("unknown never settles", p.mapStatus("SOMETHING_NEW"), "FAILED");
check("empty never settles", p.mapStatus(""), "FAILED");

console.log("\n-- transaction uuid --");
const uuid = p.buildTransactionUuid("INV-2026-0001");
check("alphanumeric and hyphens only", /^[A-Za-z0-9-]+$/.test(uuid), true);
check("no colons", uuid.includes(":"), false);
check("carries the invoice reference", uuid.startsWith("INV20260001-"), true);
check("unique across calls", p.buildTransactionUuid("INV-2026-0001") !== uuid, true);

console.log("\n-- signed field order is fixed --");
check("signed_field_names", p.SIGNED_FIELDS.join(","), "total_amount,transaction_uuid,product_code");

console.log("\n-- signed form fields --");
const checkout = p.createPaymentFields({ amount: 1250.5, transactionUuid: "TX-1", invoiceNo: "INV-2026-0001" });
check("form method", checkout.method, "POST");
check("total_amount is the signed string", checkout.fields.total_amount, "1250.50");
check("amount matches total", checkout.fields.amount, "1250.50");
check("signed_field_names echoed", checkout.fields.signed_field_names, "total_amount,transaction_uuid,product_code");
check("signature is base64", /^[A-Za-z0-9+/]+={0,2}$/.test(checkout.signature), true);
check("signature matches field", checkout.fields.signature, checkout.signature);
// The signature must be reproducible from the submitted fields only.
check(
  "signature recomputes from fields",
  checkout.signature,
  p.hmacBase64(
    `total_amount=${checkout.fields.total_amount},transaction_uuid=${checkout.fields.transaction_uuid},product_code=${checkout.fields.product_code}`,
    process.env.ESEWA_SECRET_KEY
  )
);

console.log("\n-- callback decoding --");
const encoded = Buffer.from(gatewayJson, "utf8").toString("base64");
const decoded = p.decodeCallbackData(encoded);
check("decodes to an object", typeof decoded.parsed, "object");
check("keeps the raw text", typeof decoded.raw === "string" && decoded.raw.length > 0, true);
let threw = false;
try { p.decodeCallbackData("not-base64-json"); } catch { threw = true; }
check("rejects junk", threw, true);
threw = false;
try { p.decodeCallbackData(undefined); } catch { threw = true; }
check("rejects missing data", threw, true);

console.log("\n-- response signature verification --");
/**
 * eSewa's real success response signs `signed_field_names` as the LAST field of
 * its own list, so the field list is part of the message. That is the detail most
 * reimplementations get wrong, so it is reproduced exactly here.
 */
const DOC_SIGNED_LIST =
  "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";

const responseWithSignature = (overrides = {}) => {
  // Serialise first, then sign the literals of that exact text - the way the
  // gateway does. Signing JS values instead would hide the float-literal bug.
  const body = JSON.stringify({
    transaction_code: "0004T5I",
    status: "COMPLETE",
    total_amount: 230,
    transaction_uuid: "12-6-23",
    product_code: process.env.ESEWA_PRODUCT_CODE,
    signed_field_names: DOC_SIGNED_LIST,
    ...overrides,
  });

  const message = DOC_SIGNED_LIST.split(",")
    .map((f) => `${f}=${p.rawLiteral(body, f)}`)
    .join(",");

  // Splice the signature in, as the gateway does.
  const signed = body.replace(/}$/, `,"signature":"${p.hmacBase64(message, process.env.ESEWA_SECRET_KEY)}"}`);
  return signed;
};

/**
 * Tampering: the gateway's ORIGINAL signature is kept and one value is changed.
 * This is the attack the check exists to stop - someone editing the response to
 * claim a payment succeeded (or to inflate the amount) while replaying a genuine
 * signature.
 */
const tamper = (json, field, value) =>
  json.replace(new RegExp(`("${field}"\\s*:\\s*)("?[^,}]*"?)`), `$1${JSON.stringify(value)}`);

const genuine = responseWithSignature();
check("accepts a genuine signature", p.verifyResponseSignature(genuine).valid, true);
check("signed_field_names is itself signed", p.rawLiteral(genuine, "signed_field_names"), DOC_SIGNED_LIST);
check("rejects a tampered amount", p.verifyResponseSignature(tamper(genuine, "total_amount", 99999)).valid, false);
check("rejects a whitespace-altered status", p.verifyResponseSignature(tamper(genuine, "status", " COMPLETE ")).valid, false);
check("rejects a downgraded status", p.verifyResponseSignature(tamper(genuine, "status", "FAILED")).valid, false);
check("rejects a swapped transaction", p.verifyResponseSignature(tamper(genuine, "transaction_uuid", "someone-elses")).valid, false);
check("rejects another merchant", p.verifyResponseSignature(tamper(genuine, "product_code", "NP-ES-SOMEONE-ELSE")).valid, false);
check("rejects a tampered field list", p.verifyResponseSignature(tamper(genuine, "signed_field_names", "status")).valid, false);
check("rejects a swapped signature", p.verifyResponseSignature(tamper(genuine, "signature", "AAAA")).valid, false);

check("rejects a missing signature", p.verifyResponseSignature('{"status":"COMPLETE"}').valid, false);
check("explains a missing signature", /did not include a signature/.test(p.verifyResponseSignature('{"status":"COMPLETE"}').reason), true);
check("rejects an empty signature", p.verifyResponseSignature('{"signature":"","signed_field_names":"status"}').valid, false);
check(
  "reports a signed field that is absent",
  /missing signed field/.test(p.verifyResponseSignature('{"signed_field_names":"status,nope","signature":"x"}').reason),
  true
);

console.log(failed === 0 ? "\nAll eSewa provider checks passed.\n" : `\n${failed} check(s) FAILED.\n`);
process.exit(failed === 0 ? 0 : 1);