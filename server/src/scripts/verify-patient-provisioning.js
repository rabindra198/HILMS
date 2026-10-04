/**
 * End-to-end verification of the admin-created Patient temporary-password flow
 * over a REAL SMTP conversation (no in-process transport stub).
 *
 * Spins up a local SMTP responder on a TCP socket so nodemailer genuinely
 * performs EHLO/AUTH/MAIL/RCPT/DATA, then drives the full flow through the real
 * Express app: provision -> email -> login -> forced change -> access.
 *
 * Run: node src/scripts/verify-patient-provisioning.js
 */
require("dotenv").config();

const mongoose = require("mongoose");
const { createSmtpSink } = require("./helpers/smtpSink");

const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const PasswordResetToken = require("../models/PasswordResetToken");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/email.service");

const SMTP_PORT = 2525;
const HTTP_PORT = 5097;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const call = async (method, path, { body, token } = {}) => {
  // The server mounts routers at the root (/auth, /admin, ...). The "/api"
  // prefix is added by the Vite dev proxy, not by Express.
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

const unwrap = (b) => b?.data ?? b ?? {};

const run = async () => {
  const sink = createSmtpSink({ port: SMTP_PORT, requireAuth: true });
  await sink.listen();

  // Point the real transport at the local socket. This is the only place env is
  // overridden - the application reads the same SMTP_* variables as production.
  emailService.env.email.host = "127.0.0.1";
  emailService.env.email.port = SMTP_PORT;
  emailService.env.email.secure = false;
  emailService.env.email.user = "hilms-verifier";
  emailService.env.email.password = "verifier-secret";
  emailService.setTransport(null); // drop any cached transport

  await mongoose.connect(process.env.MONGO_URI);
  const app = require("../app");
  const server = app.listen(HTTP_PORT);

  const tag = Math.random().toString(36).slice(2, 8);
  const adminEmail = `E2E_vadmin_${tag}@e2e.io`;
  const patientEmail = `E2E_vpatient_${tag}@e2e.io`;
  const emails = [adminEmail, patientEmail];

  try {
    console.log(`\nReal SMTP verification (sink on 127.0.0.1:${SMTP_PORT})\n`);
    console.log("1. Provision the admin account");
    await User.create({
      name: "Verification Admin",
      email: adminEmail,
      password: "VerifyAdmin!123",
      role: "admin",
      status: "APPROVED",
      isActive: true,
    });
    const adminLogin = await call("POST", "/auth/login", {
      body: { email: adminEmail, password: "VerifyAdmin!123" },
    });
    const adminToken = adminLogin.data?.token;
    check("admin can sign in", adminLogin.status === 200 && Boolean(adminToken));

    console.log("\n2. Admin creates a Patient account");
    const created = await call("POST", "/admin/patients", {
      token: adminToken,
      body: { name: "Verified Patient", email: patientEmail, address: "Ward 3", contactNumber: "+9779800000001" },
    });
    check("POST /admin/patients returns 201", created.status === 201, `got ${created.status}`);
    check("the account is a Patient", unwrap(created.data).user?.role === "patient");
    check("mustChangePassword is true", unwrap(created.data).user?.mustChangePassword === true);
    check("the response leaks no password", !JSON.stringify(created.data).toLowerCase().includes("temporarypassword"));

    console.log("\n3. SMTP actually delivered a message");
    check("exactly one message reached the SMTP server", sink.messages.length === 1, `got ${sink.messages.length}`);
    const message = sink.messages[0] || { to: [], raw: "" };
    check("RCPT TO is the new patient", message.to.some((a) => a && a.toLowerCase() === patientEmail.toLowerCase()), JSON.stringify(message.to));
    check("SMTP AUTH was attempted", sink.credentials.length > 0);
    const subject = (message.raw.match(/^Subject: (.*)$/m) || [])[1] || "";
    check("the subject matches the spec", subject === "HILMS - Your Temporary Login Password", `got "${subject}"`);
    const temporaryPassword = (message.raw.match(/Temporary Password:\s*(\S+)/) || [])[1];
    check("the body carries a temporary password", Boolean(temporaryPassword));
    check("the body states a mandatory change", /required to change this temporary password/i.test(message.raw));
    check("the body warns against sharing", /do not share your password/i.test(message.raw));
    check("the body includes the sign-in link", /http:\/\/localhost:5173\/login/.test(message.raw));

    console.log("\n4. What is actually stored");
    const stored = await User.findOne({ email: patientEmail.toLowerCase() }).select("+password");
    check("the stored password is a bcrypt hash", /^\$2[aby]\$/.test(stored.password));
    check("the plaintext is nowhere in the record", !Object.values(stored.toObject()).includes(temporaryPassword));
    check("the plaintext is not in the audit trail", !(await AuditLog.findOne({ targetEmail: { $regex: tag } })).metadata.password);

    console.log("\n5. Patient logs in with the temporary password");
    const tempLogin = await call("POST", "/auth/login", {
      body: { email: patientEmail, password: temporaryPassword },
    });
    check("login succeeds", tempLogin.status === 200, `got ${tempLogin.status}`);
    check("the response reports mustChangePassword", unwrap(tempLogin.data).user?.mustChangePassword === true);
    const patientToken = tempLogin.data?.token;

    console.log("\n6. Normal functionality is blocked while the change is pending");
    check("GET /auth/me still works (the client needs the session)", (await call("GET", "/auth/me", { token: patientToken })).status === 200);
    check("Admin routes are refused", (await call("GET", "/admin/users", { token: patientToken })).status === 403);
    check("Lab routes are refused", (await call("GET", "/lab/requests", { token: patientToken })).status === 403);
    const before = await call("PATCH", "/auth/change-password", {
      token: patientToken,
      body: { temporaryPassword, newPassword: "BrandNewPass!7", confirmPassword: "BrandNewPass!7" },
    });
    check("the password change succeeds", before.status === 200, `got ${before.status} ${JSON.stringify(before.data)}`);
    check("the response clears the flag", unwrap(before.data).mustChangePassword === false);

    console.log("\n7. The temporary password stops working");
    const reuse = await call("POST", "/auth/login", { body: { email: patientEmail, password: temporaryPassword } });
    check("re-login with the temporary password is 401", reuse.status === 401, `got ${reuse.status}`);
    const relogin = await call("POST", "/auth/login", { body: { email: patientEmail, password: "BrandNewPass!7" } });
    check("the new password works", relogin.status === 200, `got ${relogin.status}`);
    check("the flag stays cleared", unwrap(relogin.data).user?.mustChangePassword === false);
    check("the role is still patient", unwrap(relogin.data).user?.role === "patient");
  } finally {
    const users = await User.find({ email: { $in: emails } }).select("_id");
    const ids = users.map((u) => u._id);
    await Promise.all([
      User.deleteMany({ email: { $in: emails } }),
      AccessRequest.deleteMany({ email: { $in: emails } }),
      PasswordResetToken.deleteMany({ user: { $in: ids } }),
      Notification.deleteMany({ recipient: { $in: ids } }),
      AuditLog.deleteMany({ targetEmail: { $in: emails } }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await sink.close();
  }

  // Asserted only after teardown, otherwise the fixtures still exist by design.
  console.log("\n8. Nothing leaked into the live database");
  const leftover = await User.find({ email: { $regex: "@e2e\\.io$", $options: "i" } })
    .select("email")
    .lean();
  check("no e2e users remain after cleanup", leftover.length === 0, JSON.stringify(leftover));

  await mongoose.disconnect();

  console.log(`\n${"=".repeat(52)}\n  ${passed} passed, ${failed} failed\n${"=".repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("Verification crashed:", error);
  process.exit(1);
});
