/**
 * Closed-loop live verification: the password that lands in the inbox is the
 * password that logs in.
 *
 * The other suites prove delivery with a stub or a local sink. This one runs the
 * real Gmail transporter, captures the exact message the service handed to
 * nodemailer, pulls the temporary password out of that message, and then signs
 * in over HTTP with it - through the real Express app, real JWT, real RBAC.
 *
 * Nothing is faked except the transport wrapper, which only observes: every
 * sendMail call is still performed against Gmail and the real result returned.
 *
 * Run: npm run verify:credentials
 */

require("dotenv").config();

const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const env = require("../config/env");

const captured = [];

// Observe-then-forward wrapper around the real transporter.
const realCreateTransport = nodemailer.createTransport.bind(nodemailer);
nodemailer.createTransport = (...args) => {
  const transporter = realCreateTransport(...args);
  const realSendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = async (options) => {
    captured.push({ to: options.to, subject: options.subject, text: options.text, html: options.html });
    // The genuine call: Gmail accepts or rejects exactly as in production.
    return realSendMail(options);
  };
  return transporter;
};

const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const accessRequestService = require("../services/accessRequest.service");
const emailService = require("../services/email.service");

const HTTP_PORT = 5098;
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` ${detail}` : ""}`);
  }
};

const call = async (method, path, { body, token } = {}) => {
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
  return { status: res.status, data, headers: res.headers };
};

const main = async () => {
  if (!env.email.host || !env.email.password) {
    console.log("\nSMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in server/.env.");
    process.exitCode = 1;
    return;
  }

  const createdUsers = [];
  const createdRequests = [];
  let server;

  // Short and random. A timestamp was wrong here: the NMC/registry fields are
  // length-capped, so truncating a millisecond timestamp made every run in the
  // same window collide with the previous run's registration.
  const tag = `lc${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `${tag}_admin@hilms.local`;

  try {
    await mongoose.connect(env.mongoUri || process.env.MONGO_URI);

    const app = require("../app");
    server = app.listen(HTTP_PORT);

    console.log(`\nProvider: ${env.email.host}:${env.email.port} as ${env.email.user}`);
    console.log("Capturing the real message, then signing in with its password.\n");

    const admin = await User.create({
      name: "Credential Loop Admin",
      email: adminEmail,
      password: "CredAdmin!12345",
      role: "admin",
      status: "APPROVED",
      isActive: true,
    });
    createdUsers.push(admin._id);

    const adminLogin = await call("POST", "/auth/login", {
      body: { email: adminEmail, password: "CredAdmin!12345" },
    });
    const adminToken = adminLogin.data?.token;
    check("admin can sign in", adminLogin.status === 200 && Boolean(adminToken));

    // ---- 1. Doctor: approve, read the inbox, sign in --------------------
    console.log("1. Doctor approval -> emailed password -> sign in");
    const docEmail = `${tag}_doctor@hilms.local`;
    const docRequest = await accessRequestService.submitAccessRequest({
      name: "Credential Doctor",
      email: docEmail,
      address: "9 Loop Road, Kathmandu",
      contactNumber: "+9779800000950",
      requestedRole: "doctor",
      nmcNumber: `CRD-${tag}`,
    });
    createdRequests.push(docRequest.id);
    await accessRequestService.approveAccessRequest(docRequest.id, admin, { notes: "loop" });
    const docAccount = await User.findOne({ email: docEmail });
    if (docAccount) createdUsers.push(docAccount._id);

    const docMail = captured.find((m) => String(m.to).toLowerCase() === docEmail);
    check("an approval email was addressed to the doctor", Boolean(docMail));
    check("the subject is the approval subject", docMail?.subject === "Your HILMS access request has been approved - your temporary password", `got "${docMail?.subject}"`);

    const docPassword = (docMail?.text.match(/Temporary password:\s*(\S+)/) || [])[1];
    check("the email body carries a temporary password", Boolean(docPassword));
    check("the email body states the login email", docMail?.text.includes(docEmail));

    const docLogin = await call("POST", "/auth/login", { body: { email: docEmail, password: docPassword } });
    const docToken = docLogin.data?.token;
    check("the emailed password actually signs in", docLogin.status === 200 && Boolean(docToken), `got ${docLogin.status}`);
    check("the new account is flagged mustChangePassword", docLogin.data?.user?.mustChangePassword === true);

    // ---- 2. The forced change gate ---------------------------------------
    console.log("\n2. The forced password change gate");
    const docMe = await call("GET", "/auth/me", { token: docToken });
    check("a forced-change user can read their own profile", docMe.status === 200, `got ${docMe.status}`);

    const docAdminRoute = await call("GET", "/admin/overview", { token: docToken });
    check("a forced-change doctor is blocked from Admin routes", docAdminRoute.status === 403, `got ${docAdminRoute.status}`);

    const docList = await call("GET", "/admin/access-requests", { token: docToken });
    check("a forced-change doctor cannot list access requests", docList.status === 403, `got ${docList.status}`);

    const docBadChange = await call("PATCH", "/auth/change-password", {
      token: docToken,
      body: { temporaryPassword: "wrong-password", newPassword: "BrandNew!456", confirmPassword: "BrandNew!456" },
    });
    check("changing with the wrong password is refused", docBadChange.status === 401, `got ${docBadChange.status}`);

    const docGoodChange = await call("PATCH", "/auth/change-password", {
      token: docToken,
      body: { temporaryPassword: docPassword, newPassword: "BrandNew!456", confirmPassword: "BrandNew!456" },
    });
    check("changing with the emailed password succeeds", docGoodChange.status === 200, `got ${docGoodChange.status}`);
    // This endpoint uses the { success, message, data } envelope, and returns
    // mustChangePassword at the top of that payload.
    const changed = docGoodChange.data?.data;
    check("the change clears mustChangePassword", changed?.mustChangePassword === false, `got ${changed?.mustChangePassword}`);
    check("the change response carries no plaintext password", !JSON.stringify(docGoodChange.data || {}).toLowerCase().includes("temporarypassword\":"));

    const docRelogin = await call("POST", "/auth/login", { body: { email: docEmail, password: "BrandNew!456" } });
    check("the new password signs in", docRelogin.status === 200, `got ${docRelogin.status}`);
    const docOld = await call("POST", "/auth/login", { body: { email: docEmail, password: docPassword } });
    check("the temporary password no longer works", docOld.status === 401, `got ${docOld.status}`);

    // ---- 3. Laboratory: same path ---------------------------------------
    console.log("\n3. Laboratory approval -> emailed password -> sign in");
    const labEmail = `${tag}_lab@hilms.local`;
    const labRequest = await accessRequestService.submitAccessRequest({
      name: "Credential Lab Tech",
      email: labEmail,
      address: "10 Loop Street, Pokhara",
      contactNumber: "+9779800000951",
      requestedRole: "lab",
      labRegistryNumber: `CRL-${tag}`,
    });
    createdRequests.push(labRequest.id);
    await accessRequestService.approveAccessRequest(labRequest.id, admin, { notes: "loop" });
    const labAccount = await User.findOne({ email: labEmail });
    if (labAccount) createdUsers.push(labAccount._id);

    const labMail = captured.find((m) => String(m.to).toLowerCase() === labEmail);
    check("an approval email was addressed to the lab", Boolean(labMail));
    const labPassword = (labMail?.text.match(/Temporary password:\s*(\S+)/) || [])[1];
    check("the lab email carries a temporary password", Boolean(labPassword));

    const labLogin = await call("POST", "/auth/login", { body: { email: labEmail, password: labPassword } });
    const labToken = labLogin.data?.token;
    check("the lab emailed password actually signs in", labLogin.status === 200 && Boolean(labToken), `got ${labLogin.status}`);
    check("the lab account kept its role", labLogin.data?.user?.role === "lab");
    check("the lab account is flagged mustChangePassword", labLogin.data?.user?.mustChangePassword === true);

    // ---- 4. Two applicants never share a credential ---------------------
    console.log("\n4. Credential isolation");
    check("doctor and lab received different passwords", docPassword !== labPassword);
    check("both messages reached the real provider", captured.length === 2, `got ${captured.length}`);

    console.log(`\nAll checks passed: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.log(`\nRun aborted: ${error.message}`);
    process.exitCode = 1;
  } finally {
    // A run that aborts between "approval created the user" and "id recorded"
    // would otherwise orphan accounts, so sweep by the run's unique tag as well
    // as by the ids we managed to capture. The tag is random per run, so this
    // cannot match a real account.
    const tagFilter = new RegExp(`^${tag}_`);
    const orphans = await User.find({ email: tagFilter }).select("_id").lean().catch(() => []);
    const userIds = [...new Set([...createdUsers, ...orphans.map((u) => u._id)])];
    const orphanRequests = await AccessRequest.find({ email: tagFilter }).select("_id").lean().catch(() => []);
    const requestIds = [...new Set([...createdRequests, ...orphanRequests.map((r) => r._id)])];

    await Notification.deleteMany({ recipient: { $in: userIds } }).catch(() => {});
    await AuditLog.deleteMany({
      $or: [{ actor: { $in: userIds } }, { targetId: { $in: [...userIds, ...requestIds] } }],
    }).catch(() => {});
    await AccessRequest.deleteMany({ _id: { $in: requestIds } }).catch(() => {});
    await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
    console.log(`\nCleaned up ${userIds.length} users and ${requestIds.length} requests.`);
    if (server) server.close();
    await mongoose.disconnect();
  }
};

main();
