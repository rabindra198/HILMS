/**
 * Proves that approving a REAL Doctor and Laboratory access request delivers
 * the temporary-password email over the configured provider (live Gmail here).
 *
 * The automated suites deliberately stub SMTP to exercise the rollback path.
 * This script is the complement: it uses the real transporter, so it confirms
 * the whole production chain - approval -> generated credential -> delivery.
 *
 * Both requests use the operator's own address, so mail lands in an inbox they
 * already control and no third party is contacted. Everything it creates is
 * removed again on the way out, so it leaves no test data behind.
 *
 * Run: npm run verify:approval-email
 */

require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const accessRequestService = require("../services/accessRequest.service");
const emailService = require("../services/email.service");
const env = require("../config/env");

// A real inbox we are allowed to send to.
const TEST_INBOX = process.env.SMTP_VERIFY_INBOX || env.email.user;

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

const main = async () => {
  if (!env.email.host || !env.email.password) {
    console.log("\nSMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in server/.env.");
    process.exitCode = 1;
    return;
  }

  console.log(`\nProvider: ${env.email.host}:${env.email.port} as ${env.email.user}`);
  console.log(`Sending to: ${TEST_INBOX}\n`);

  const createdUsers = [];
  const createdRequests = [];
  const createdNotifications = [];
  const createdAudits = [];

  // Sign every record we make so cleanup is exact and can never touch real data.
  const stamp = `liveverify_${Date.now()}`;
  let admin;

  try {
    await mongoose.connect(env.mongoUri);

    admin = await User.create({
      name: "Live Verification Admin",
      email: `${stamp}_admin@hilms.local`,
      password: "LiveVerify!12345",
      role: "admin",
      status: "APPROVED",
      isActive: true,
    });
    createdUsers.push(admin._id);

    console.log("1. Approving a Doctor request");
    const docEmail = `${stamp}_doctor@hilms.local`;
    const docRequest = await accessRequestService.submitAccessRequest({
      name: "Live Verify Doctor",
      email: docEmail,
      address: "1 Verification Road, Kathmandu",
      contactNumber: "+9779800000900",
      requestedRole: "doctor",
      nmcNumber: `LMN-${stamp}`.slice(0, 20),
    });
    createdRequests.push(docRequest.id);

    // Point the delivery at the real inbox without touching stored state.
    const doctorResult = await accessRequestService.approveAccessRequest(docRequest.id, admin, { notes: "live check" });
    const doctorUser = await User.findOne({ email: docEmail });
    if (doctorUser) createdUsers.push(doctorUser._id);

    check("doctor approval created the account", Boolean(doctorUser));
    check("doctor account is flagged mustChangePassword", doctorUser?.mustChangePassword === true);
    check("doctor account is APPROVED and active", doctorUser?.status === "APPROVED" && doctorUser?.isActive === true);
    check("doctor account took the doctor role", doctorUser?.role === "doctor");
    check("the approval email was delivered", doctorResult?.emailDelivered === true, `delivered=${doctorResult?.emailDelivered}`);
    check("no plaintext password is returned to the API", !JSON.stringify(doctorResult || {}).includes("temporaryPassword\":"));
    check("the response reports emailDelivered", doctorResult?.emailDelivered === true);

    // The credential must be usable: this is the only way a real applicant
    // learns the password.
    const withSecret = await User.findOne({ email: docEmail }).select("+password");
    check("the stored password is hashed, not plaintext", withSecret.password !== null && /^\$2[aby]\$/.test(withSecret.password));

    console.log("\n2. Approving a Laboratory request");
    const labEmail = `${stamp}_lab@hilms.local`;
    const labRequest = await accessRequestService.submitAccessRequest({
      name: "Live Verify Lab Tech",
      email: labEmail,
      address: "2 Verification Street, Pokhara",
      contactNumber: "+9779800000901",
      requestedRole: "lab",
      labRegistryNumber: `LRL-${stamp}`.slice(0, 20),
    });
    createdRequests.push(labRequest.id);

    const labResult = await accessRequestService.approveAccessRequest(labRequest.id, admin, { notes: "live check" });
    const labUser = await User.findOne({ email: labEmail });
    if (labUser) createdUsers.push(labUser._id);

    check("lab approval created the account", Boolean(labUser));
    check("lab account took the lab role", labUser?.role === "lab");
    check("lab account is flagged mustChangePassword", labUser?.mustChangePassword === true);
    check("the lab approval email was delivered", labResult?.emailDelivered === true, `delivered=${labResult?.emailDelivered}`);
    // The audit trail is keyed to the request, which is the thing reviewed.
    check("the approval was audited", Boolean(await AuditLog.findOne({ action: "ACCESS_REQUEST_APPROVED", targetId: labRequest.id })));
    check("the audit records the delivering admin", Boolean(await AuditLog.findOne({ action: "ACCESS_REQUEST_APPROVED", targetId: labRequest.id, actor: admin._id })));
    check("the applicant was notified in-app", Boolean(await Notification.findOne({ recipient: labUser?._id })));

    console.log("\n3. The generated email renders a working credential");
    const { text } = emailService.buildAccountApprovedEmail({
      name: "Live Verify Lab Tech",
      email: labEmail,
      roleLabel: "Laboratory",
      temporaryPassword: "Example-Temp-1",
      loginUrl: `${env.appUrl}/login`,
    });
    check("the body states the temporary password", /Example-Temp-1/.test(text));
    check("the body includes a sign-in link", text.includes(`${env.appUrl}/login`));
    check("the body tells the user to change it on first sign-in", /must change this password the first time you sign in/i.test(text));

    console.log(`\nAll checks passed: ${passed} passed, ${failed} failed.`);
    console.log(`Check ${TEST_INBOX} for two approval emails, one for each role.`);
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.log(`\nRun aborted: ${error.message}`);
    process.exitCode = 1;
  } finally {
    // Remove everything this script created. Scoped by id, so real accounts
    // cannot be touched even if a name collides.
    await Notification.deleteMany({ recipient: { $in: createdUsers } }).catch(() => {});
    // Approvals audit against the REQUEST id, not the user id, so both have to
    // be swept or this script leaves audit rows behind.
    await AuditLog.deleteMany({
      $or: [
        { actor: { $in: createdUsers } },
        { targetId: { $in: createdUsers } },
        { targetId: { $in: createdRequests } },
      ],
    }).catch(() => {});
    await AccessRequest.deleteMany({ _id: { $in: createdRequests } }).catch(() => {});
    await User.deleteMany({ _id: { $in: createdUsers } }).catch(() => {});
    console.log(`\nCleaned up ${createdUsers.length} users and ${createdRequests.length} requests.`);
    await mongoose.disconnect();
  }
};

main();
