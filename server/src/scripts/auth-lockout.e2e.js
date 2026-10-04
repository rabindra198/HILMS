/**
 * FR-AUTH-10 / NFR-04 verification: an account locks after a configurable number
 * of consecutive failed sign-ins, stays locked against the CORRECT password for
 * the duration, then unlocks and resets its counter on the next good sign-in.
 *
 * The policy is read from the environment at boot, so the window is compressed
 * here rather than making the suite wait the production 15 minutes. The values
 * are set before the app (and therefore `config/env`) is required so they win
 * over the real `.env`, which dotenv never overrides.
 */
process.env.LOGIN_MAX_ATTEMPTS = "3";
process.env.LOGIN_LOCKOUT_MINUTES = "0.02"; // 1.2 seconds

require("dotenv").config();

const mongoose = require("mongoose");

const app = require("../app");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");

const PORT = 5098;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
let server;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
};

const section = (title) => console.log(`\n${title}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const call = async (method, path, { body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, retryAfter: res.headers.get("retry-after") };
};

const login = (email, password) => call("POST", "/auth/login", { body: { email, password } });

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  server = app.listen(PORT);

  const tag = Math.random().toString(36).slice(2, 10);
  const email = `e2e_lockout_${tag}@e2e.io`;
  const password = "Lockout!Pass1";
  const unknownEmail = `e2e_lockout_missing_${tag}@e2e.io`;

  await User.create({
    name: "Lockout Fixture",
    email,
    password,
    role: "patient",
    status: "APPROVED",
  });

  try {
    section("1. A wrong password never confirms whether the account exists");
    const wrong = await login(email, "definitely-not-it");
    const unknown = await login(unknownEmail, "definitely-not-it");
    check("wrong password is 401", wrong.status === 401, `got ${wrong.status}`);
    check("unknown email is 401", unknown.status === 401, `got ${unknown.status}`);
    check(
      "both responses carry the same generic message",
      wrong.data?.message === unknown.data?.message && wrong.data?.message === "Invalid email or password",
      JSON.stringify({ wrong: wrong.data?.message, unknown: unknown.data?.message })
    );

    section("2. Repeated failures lock the account (threshold = 3)");
    const second = await login(email, "definitely-not-it");
    check("the second failure is still 401", second.status === 401, `got ${second.status}`);

    const third = await login(email, "definitely-not-it");
    check("the third failure locks the account (423)", third.status === 423, `got ${third.status}`);
    check("the lock response carries a machine-readable code", third.data?.code === "ACCOUNT_LOCKED", third.data?.code);
    check("a Retry-After header is advertised", Number(third.retryAfter) >= 1, `got ${third.retryAfter}`);

    section("3. A locked account is refused even with the correct password");
    const correctWhileLocked = await login(email, password);
    check("the correct password is refused while locked (423)", correctWhileLocked.status === 423, `got ${correctWhileLocked.status}`);

    const stored = await User.findOne({ email }).lean();
    check("the account carries a future lockUntil", Boolean(stored.lockUntil) && new Date(stored.lockUntil).getTime() > Date.now());
    check("the failed-attempt counter is retained", stored.failedLoginAttempts >= 3, String(stored.failedLoginAttempts));

    section("4. The lockout is recorded in the audit trail (NFR-04)");
    check(
      "an ACCOUNT_LOCKED entry exists for the account",
      Boolean(await AuditLog.findOne({ action: "ACCOUNT_LOCKED", targetEmail: email }).lean())
    );
    check(
      "each earlier failure is recorded too",
      (await AuditLog.countDocuments({ action: "LOGIN_FAILED", targetEmail: email })) >= 2,
      `got ${await AuditLog.countDocuments({ action: "LOGIN_FAILED", targetEmail: email })}`
    );

    section("5. The lock expires and a good sign-in resets the counter");
    await sleep(2000);
    const unlocked = await login(email, password);
    check("the correct password works once the lock expires", unlocked.status === 200, `got ${unlocked.status}`);
    check("a token is issued", Boolean(unlocked.data?.token));

    const after = await User.findOne({ email }).lean();
    check("the failed-attempt counter is reset", after.failedLoginAttempts === 0, String(after.failedLoginAttempts));
    check("lockUntil is cleared", after.lockUntil === null || after.lockUntil === undefined, String(after.lockUntil));

    section("6. An unknown email is never an effective lockout oracle");
    const unknownAttempts = [];
    for (let i = 0; i < 4; i += 1) {
      unknownAttempts.push((await login(unknownEmail, "definitely-not-it")).status);
    }
    check(
      "an unknown email keeps returning 401 and never 423",
      unknownAttempts.every((status) => status === 401),
      JSON.stringify(unknownAttempts)
    );

    section("7. The counter resets so the next typo is not a lock");
    const afterResetWrong = await login(email, "one-more-typo");
    check("a single failure after a good sign-in is just 401", afterResetWrong.status === 401, `got ${afterResetWrong.status}`);
  } finally {
    const users = await User.find({ email: { $in: [email, unknownEmail] } }).select("_id");
    const ids = users.map((u) => u._id);
    await Promise.all([
      User.deleteMany({ email: { $in: [email, unknownEmail] } }),
      AuditLog.deleteMany({ targetEmail: { $in: [email, unknownEmail] } }),
      Notification.deleteMany({ recipient: { $in: ids } }),
    ]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  console.log(`\n${"=".repeat(52)}\n  ${passed} passed, ${failed} failed\n${"=".repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch(async (error) => {
  console.error("\nAuth lockout E2E crashed:", error);
  if (server) await new Promise((resolve) => server.close(resolve)).catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
