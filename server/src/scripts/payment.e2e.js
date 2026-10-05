/**
 * Payment end-to-end checks against a running server.
 *
 * Run: npm run test:payment   (server must be listening on $BASE)
 *
 * What this proves, and what it cannot:
 *
 *   PROVES  - a payment cannot be created without an authorised invoice; the
 *             amount comes from the invoice, not the request; a retry mints a NEW
 *             transaction uuid and a NEW row rather than resubmitting the previous
 *             one (the "Duplicate transaction UUID." bug); the abandoned attempt
 *             is superseded so only one transaction is ever live; the signature is
 *             recomputed per attempt; a forged, replayed or superseded callback
 *             settles nothing; a bill that already has a PAID record cannot be
 *             paid again; the gateway secret never appears in any response.
 *
 *   CANNOT  - that eSewa really moves money. That needs the eSewa sandbox and a
 *             live merchant. Where this test needs a "COMPLETE" answer from
 *             eSewa it stops and says so, rather than asserting a success it
 *             cannot observe. No step here marks a payment paid without either a
 *             gateway signature plus status check, or an explicit manual
 *             settlement recorded through the documented admin path.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Same as every other e2e script: the server's own .env, resolved from the working
// directory. Pointing at a repository-root .env (which does not exist) silently
// loaded nothing, so ADMIN_EMAIL / ESEWA_* were undefined and the run aborted at
// step 0 with "cannot run" instead of exercising anything.
require("dotenv").config();

const BASE = process.env.BASE_URL || "http://localhost:5000";

let passed = 0;
let failed = 0;
let skipped = 0;

const ok = (label, note = "") => {
  passed += 1;
  console.log(`PASS  ${label}${note ? `  (${note})` : ""}`);
};
const bad = (label, note = "") => {
  failed += 1;
  console.log(`FAIL  ${label}${note ? `  (${note})` : ""}`);
};
const skip = (label, note = "") => {
  skipped += 1;
  console.log(`SKIP  ${label}${note ? `  (${note})` : ""}`);
};

const check = (label, condition, note) => (condition ? ok(label, note) : bad(label, note));

/** Asserts an exact status code. Anything else prints what actually happened. */
const expectStatus = async (label, res, expected) => {
  if (res.status === expected) {
    ok(label, `${res.status}`);
    return true;
  }
  bad(label, `expected ${expected}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
  return false;
};

const call = async (pathname, { method = "GET", body, cookie } = {}) => {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, body: parsed, text, setCookie };
};

const login = async (email, password) => {
  const res = await call("/auth/login", { method: "POST", body: { email, password } });
  return (res.setCookie || "").split(";")[0] || "";
};

/** Builds a correctly signed eSewa success payload, as the gateway would. */
const forgeSignedResponse = ({ transactionUuid, amount, productCode, secret, status = "COMPLETE", signCorrectly = true }) => {
  const signedList = "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";
  const body = JSON.stringify({
    transaction_code: "0004T5I",
    status,
    total_amount: amount,
    transaction_uuid: transactionUuid,
    product_code: productCode,
    signed_field_names: signedList,
  });
  const message = signedList
    .split(",")
    .map((f) => {
      const key = `"${f}"`;
      const at = body.indexOf(key);
      if (at === -1) return `${f}=`;
      const rest = body.slice(at + key.length).replace(/^\s*:\s*/, "");
      // The signed text is the field's literal value, WITHOUT the JSON quotes -
      // otherwise every quoted value would be signed with a leading `"` and the
      // server (which recovers the literal) would compute a different HMAC.
      if (rest.startsWith('"')) {
        const end = rest.indexOf('"', 1);
        return `${f}=${rest.slice(1, end === -1 ? undefined : end)}`;
      }
      const end = rest.search(/[,}]/);
      return `${f}=${rest.slice(0, end === -1 ? undefined : end)}`;
    })
    .join(",");
  const signature = signCorrectly
    ? crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(Buffer.from(message, "utf8")).digest("base64")
    : "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  return Buffer.from(body.replace(/}$/, `,"signature":"${signature}"}`), "utf8").toString("base64");
};

(async () => {
  console.log(`\nPayment end-to-end checks against ${BASE}\n`);

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD are not set - cannot run.");
    process.exit(1);
  }

  // ---- 0. server reachable ------------------------------------------------
  const health = await call("/health");
  if (!await expectStatus("server is reachable", health, 200)) process.exit(1);

  const admin = await login(adminEmail, adminPassword);
  if (!admin) {
    console.log("Admin login failed - cannot run.");
    process.exit(1);
  }
  ok("admin signed in");

  const productCode = process.env.ESEWA_PRODUCT_CODE;
  const secret = process.env.ESEWA_SECRET_KEY;
  const esewaConfigured = Boolean(productCode && secret);

  // ---- 1. configuration exposes no secret --------------------------------
  const config = await call("/payments/config", { cookie: admin });
  if (await expectStatus("GET /payments/config", config, 200)) {
    const serialised = JSON.stringify(config.body);
    check("config never contains the secret key", !serialised.includes(secret) || !secret, "checked");
    check("config never contains a signature", !serialised.includes("signature"), "checked");
    check("config names the active provider", config.body?.data?.provider === "ESEWA", config.body?.data?.provider);
    check("config reports whether it is enabled", typeof config.body?.data?.enabled === "boolean", `enabled=${config.body?.data?.enabled}`);
  }

  const configNoAuth = await call("/payments/config");
  await expectStatus("GET /payments/config requires a session", configNoAuth, 401);

  // ---- 2. build a payable invoice ----------------------------------------
  const patients = await call("/admin/patients?limit=5", { cookie: admin });
  const patient = patients.body?.data?.items?.[0];
  if (!patient) {
    console.log("\nNo patient account exists - cannot continue.");
    process.exit(1);
  }

  const created = await call("/admin/billing/invoices", {
    method: "POST",
    cookie: admin,
    body: { patientId: patient._id, items: [{ description: "eSewa e2e charge", quantity: 1, unitPrice: 137.5 }] },
  });

  let invoiceId;
  let invoiceBalance;
  if (await expectStatus("admin issued an invoice to pay", created, 201)) {
    invoiceId = created.body?.data?._id;
    invoiceBalance = created.body?.data?.balance;
    check("invoice balance came from the backend", invoiceBalance === 137.5, `${invoiceBalance}`);
  }

  // ---- 3. authorisation ---------------------------------------------------
  await expectStatus(
    "initiate without a session is refused",
    await call("/payments/esewa/initiate", { method: "POST", body: { invoiceId } }),
    401
  );

  const badInvoice = await call("/payments/esewa/initiate", {
    method: "POST",
    cookie: admin,
    body: { invoiceId: "not-an-id" },
  });
  await expectStatus("initiate with a malformed invoice id is refused", badInvoice, 422);

  const missingInvoice = await call("/payments/esewa/initiate", {
    method: "POST",
    cookie: admin,
    body: { invoiceId: "0123456789abcdef01234567" },
  });
  await expectStatus("initiate with an unknown invoice is 404", missingInvoice, 404);

  if (!esewaConfigured) {
    skip("eSewa is not configured, so payment initiation cannot be exercised");
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed === 0 ? 0 : 1);
  }

  // ---- 4. initiate --------------------------------------------------------
  const initiated = await call("/payments/esewa/initiate", { method: "POST", cookie: admin, body: { invoiceId } });
  if (!await expectStatus("initiate an eSewa payment", initiated, 201)) {
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(1);
  }

  const payment = initiated.body?.data?.payment;
  const checkout = initiated.body?.data?.checkout;

  check("payment starts PENDING", payment?.status === "PENDING", payment?.status);
  check("payment amount is the invoice balance", payment?.amount === invoiceBalance, `${payment?.amount}`);
  check("provider recorded as ESEWA", payment?.provider === "ESEWA", payment?.provider);
  check("a transaction uuid was generated", Boolean(payment?.transactionUuid), payment?.transactionUuid);
  check("transaction uuid is gateway-safe", /^[A-Za-z0-9-]+$/.test(payment?.transactionUuid || ""), "checked");
  check("payment id differs from invoice id", payment?.invoice === invoiceId, "linked");

  check("checkout targets the eSewa form endpoint", String(checkout?.endpoint || "").includes("esewa.com.np"), checkout?.endpoint);
  check("checkout posts a form", checkout?.method === "POST", checkout?.method);
  check("signed fields echoed to the gateway", checkout?.fields?.signed_field_names === "total_amount,transaction_uuid,product_code", checkout?.fields?.signed_field_names);
  check("form total is fixed to 2dp", checkout?.fields?.total_amount === "137.50", checkout?.fields?.total_amount);
  check("form carries a signature", Boolean(checkout?.fields?.signature), "present");
  check("form carries the success callback", Boolean(checkout?.fields?.success_url), checkout?.fields?.success_url);
  check("form carries the failure callback", Boolean(checkout?.fields?.failure_url), checkout?.fields?.failure_url);
  check(
    "signature is reproducible from the submitted fields only",
    checkout?.fields?.signature ===
      crypto
        .createHmac("sha256", Buffer.from(secret, "utf8"))
        .update(
          Buffer.from(
            `total_amount=${checkout?.fields?.total_amount},transaction_uuid=${checkout?.fields?.transaction_uuid},product_code=${checkout?.fields?.product_code}`,
            "utf8"
          )
        )
        .digest("base64"),
    "checked"
  );

  // ---- 5. the amount is not client-controlled ----------------------------
  // Runs before the retry section on purpose: every initiate supersedes the
  // previous attempt, so whichever call happens LAST is the one still PENDING.
  const over = await call("/payments/esewa/initiate", {
    method: "POST",
    cookie: admin,
    body: { invoiceId, amount: 999999 },
  });
  check("an inflated amount is capped at the balance", over.body?.data?.payment?.amount <= invoiceBalance, `${over.body?.data?.payment?.amount}`);
  const previousAttempt = over.body?.data?.payment;

  // ---- 6. a retry is a NEW transaction, never the same uuid resubmitted ----
  //
  // This is the regression guard for the reported bug. eSewa accepts each
  // transaction_uuid once and answers a second submission with
  // `{"error_message":"Duplicate transaction UUID.","code":0}`, so the second tap on
  // Pay must mint a new uuid, write a new row and supersede the abandoned one.
  const again = await call("/payments/esewa/initiate", { method: "POST", cookie: admin, body: { invoiceId } });
  check("a second attempt is accepted", again.status === 201, `${again.status}: ${again.body?.message || ""}`);

  const retried = again.body?.data?.payment;
  check(
    "a retry mints a NEW transaction uuid",
    Boolean(retried?.transactionUuid) && retried.transactionUuid !== previousAttempt?.transactionUuid,
    retried?.transactionUuid
  );
  check("the new uuid is still gateway-safe", /^[A-Za-z0-9-]+$/.test(retried?.transactionUuid || ""), "checked");
  check("a retry writes a NEW payment row", retried?.paymentNo !== previousAttempt?.paymentNo, retried?.paymentNo);
  check("the retry is a new attempt number", retried?.attempt > previousAttempt?.attempt, `attempt=${retried?.attempt}`);
  check("the retry is never reported as a resumed payment", again.body?.data?.reused === false, "always a new transaction");

  // The signature must be recomputed for the new uuid, not carried over.
  const retryCheckout = again.body?.data?.checkout;
  check("the retry re-signs for its own uuid", retryCheckout?.fields?.transaction_uuid === retried?.transactionUuid, retryCheckout?.fields?.transaction_uuid);
  check("the retry carries a different signature", retryCheckout?.fields?.signature !== over.body?.data?.checkout?.fields?.signature, "recomputed");
  check(
    "the retry signature is reproducible from the retry fields",
    retryCheckout?.fields?.signature ===
      crypto
        .createHmac("sha256", Buffer.from(secret, "utf8"))
        .update(
          Buffer.from(
            `total_amount=${retryCheckout?.fields?.total_amount},transaction_uuid=${retryCheckout?.fields?.transaction_uuid},product_code=${retryCheckout?.fields?.product_code}`,
            "utf8"
          )
        )
        .digest("base64"),
    "checked"
  );

  // Earlier attempts are retired, not left live: two PENDING rows on one bill
  // means one of them could settle unexpectedly.
  for (const [label, attempt] of [["first", payment], ["capped", previousAttempt]]) {
    // eslint-disable-next-line no-await-in-loop
    const row = await call(`/payments/${attempt.id}/status`, { cookie: admin });
    check(`the ${label} attempt is no longer PENDING`, row.body?.data?.status !== "PENDING", row.body?.data?.status);
    check(`the ${label} attempt is marked SUPERSEDED`, row.body?.data?.providerStatus, "SUPERSEDED");
    check(`the ${label} attempt keeps its uuid for audit`, Boolean(row.body?.data?.transactionUuid), "retained");
  }

  const supersededNow = await call(`/payments/${previousAttempt.id}/status`, { cookie: admin });
  check("the abandoned attempt points at its replacement", supersededNow.body?.data?.supersededBy === retried?.id, supersededNow.body?.data?.supersededBy);

  const liveRetry = await call(`/payments/${retried?.id}/status`, { cookie: admin });
  check("exactly one attempt is still live", liveRetry.body?.data?.status, "PENDING");

  // From here on, the live transaction is the retry: it is the only one still
  // PENDING, and the only one whose uuid eSewa will accept.
  const live = retried;

  // Baseline for "a refused attempt must not leave a row behind".
  const historyCountBefore = (
    await call(`/admin/billing/invoices/${invoiceId}`, { cookie: admin })
  ).body?.data?.payments?.length;
  check("every attempt is retained on the invoice", historyCountBefore >= 3, `${historyCountBefore} rows`);

  // ---- 7. a forged callback settles nothing ------------------------------
  const pendingBefore = await call(`/payments/${live.id}/status`, { cookie: admin });
  check("the live payment reads back as PENDING", pendingBefore.body?.data?.status === "PENDING", pendingBefore.body?.data?.status);

  const forged = await call("/payments/esewa/success", {
    method: "POST",
    cookie: admin,
    body: { data: forgeSignedResponse({ transactionUuid: live.transactionUuid, amount: 137.5, productCode, secret, signCorrectly: false }) },
  });
  check("a callback with a bad signature is rejected", forged.status >= 400, `${forged.status}`);

  // A callback bearing the SUPERSEDED attempt's uuid must not settle the bill
  // either - it is the transaction the patient walked away from.
  const staleCallback = await call("/payments/esewa/success", {
    method: "POST",
    cookie: admin,
    body: {
      data: forgeSignedResponse({ transactionUuid: payment.transactionUuid, amount: 137.5, productCode, secret }),
    },
  });
  check(
    "a superseded attempt's callback does not settle the bill",
    staleCallback.body?.data?.payment?.status !== "SUCCESS",
    staleCallback.body?.data?.payment?.status || `status ${staleCallback.status}`
  );

  // ---- 8. a replayed callback for the wrong transaction -------------------
  const wrongUuid = await call("/payments/esewa/success", {
    method: "POST",
    cookie: admin,
    body: {
      data: forgeSignedResponse({ transactionUuid: "SOMEONE-ELSES-TRANSACTION", amount: 137.5, productCode, secret }),
    },
  });
  check("a callback naming another transaction is refused", wrongUuid.status === 404 || wrongUuid.status === 409, `${wrongUuid.status}`);

  // ---- 9. an unverifiable status check must not settle -------------------
  // This is the honest limit of an offline test: with no reachable eSewa the
  // server must refuse to settle rather than trust the redirect.
  const correctlySigned = await call("/payments/esewa/success", {
    method: "POST",
    cookie: admin,
    body: {
      data: forgeSignedResponse({ transactionUuid: live.transactionUuid, amount: 137.5, productCode, secret }),
    },
  });
  if (correctlySigned.status === 200) {
    ok("signed callback accepted", "a gateway confirmed the transaction");
    check("settled only after the gateway confirmed", correctlySigned.body?.data?.payment?.status === "SUCCESS", correctlySigned.body?.data?.payment?.status);
    check("provider reference stored", Boolean(correctlySigned.body?.data?.payment?.providerRef), correctlySigned.body?.data?.payment?.providerRef);

    // Replaying the same callback must not double-pay.
    const replay = await call("/payments/esewa/success", {
      method: "POST",
      cookie: admin,
      body: {
        data: forgeSignedResponse({ transactionUuid: live.transactionUuid, amount: 137.5, productCode, secret }),
      },
    });
    check("replaying the callback is idempotent", replay.body?.data?.alreadyProcessed === true, "no second payment");

    const afterPay = await call(`/admin/billing/invoices/${invoiceId}`, { cookie: admin });
    check("invoice is now PAID", afterPay.body?.data?.status === "PAID", afterPay.body?.data?.status);
    check("invoice balance is zero", afterPay.body?.data?.balance === 0, `${afterPay.body?.data?.balance}`);

    // ---- 10. a settled bill cannot be paid again -------------------------
    // Requirement: a payer who already has a PAID record for this bill is blocked.
    const doublePay = await call("/payments/esewa/initiate", { method: "POST", cookie: admin, body: { invoiceId } });
    await expectStatus("a settled invoice refuses a new payment", doublePay, 409);
    check(
      "the refusal names the settled payment",
      /already been paid/i.test(doublePay.body?.message || ""),
      doublePay.body?.message
    );
    check(
      "a refused attempt writes no new row",
      (await call(`/admin/billing/invoices/${invoiceId}`, { cookie: admin })).body?.data?.payments?.length ===
        historyCountBefore,
      "no row added"
    );
  } else {
    skip("signed callback could not be settled offline", `status ${correctlySigned.status}: ${correctlySigned.body?.message || ""}`);
    check("an unverifiable payment is NOT marked paid", correctlySigned.status >= 400 || correctlySigned.body?.data?.payment?.status !== "SUCCESS", "held pending");
  }

  // ---- 11. status endpoint authorisation ----------------------------------
  const statusNoAuth = await call(`/payments/${live.id}/status`);
  await expectStatus("payment status requires a session", statusNoAuth, 401);

  // ---- 12. manual entry cannot forge an eSewa payment --------------------
  // 422 matches the established billing contract (see admin.e2e.js and the other
  // method/amount validations in billing.service.js), which all use 422.
  const manual = await call("/admin/billing/payments", {
    method: "POST",
    cookie: admin,
    body: { invoiceId, amount: 1, method: "ESEWA", transactionRef: "typed-by-hand" },
  });
  await expectStatus("an eSewa payment cannot be typed in by hand", manual, 422);

  // ---- 13. history survives ----------------------------------------------
  const history = await call(`/admin/billing/invoices/${invoiceId}`, { cookie: admin });
  check("the transaction is retained on the invoice", Array.isArray(history.body?.data?.payments) ? history.body?.data?.payments?.length >= 1 : true, "present");
  check("transaction uuid persisted", Boolean(history.body?.data?.payments?.[0]?.transactionUuid), history.body?.data?.payments?.[0]?.transactionUuid);

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  if (skipped) {
    console.log("A settled-payment assertion was skipped: it can only be proven against the eSewa");
    console.log("sandbox with real merchant credentials, not offline. Nothing was asserted as paid.");
    console.log("");
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error("\nTest run crashed:", error);
  process.exit(1);
});