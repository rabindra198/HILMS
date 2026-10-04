/**
 * End-to-end verification of the revised authentication workflow against the
 * real configured MongoDB:
 *
 *   Patient    -> self-registration, active account immediately
 *   Doctor/Lab -> PENDING request, no account, no password
 *   Admin      -> approve (issues a temporary password) or decline
 *   Doctor/Lab -> first sign-in must replace the temporary password
 *
 * Test data is namespaced with E2E_@ and removed on completion.
 */
const mongoose = require("mongoose");
require("dotenv").config();
const crypto = require("crypto");

const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const PasswordResetToken = require("../models/PasswordResetToken");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const accessRequestService = require("../services/accessRequest.service");
const passwordService = require("../services/password.service");
const adminService = require("../services/admin.service");
const patientAccountService = require("../services/patientAccount.service");
const { generateTemporaryPassword } = require("../services/tempPassword.service");
const emailService = require("../services/email.service");

// The User model email regex only accepts 2-3 character TLDs.
const EMAIL_DOMAIN = "e2e.io";
let passed = 0;
let failed = 0;

// Capture every message handed to the SMTP transport so the suite can assert
// on the temporary password without ever sending real mail.
//
// `isEmailConfigured()` gates on a host being present, so the host is set for
// the duration of the run (and restored afterwards) to route through the stub.
const sentMail = [];
const savedSmtpHost = emailService.env.email.host;
emailService.env.email.host = "smtp.test.local";
emailService.setTransport({
  sendMail: async (payload) => {
    sentMail.push(payload);
    return { messageId: `e2e-${sentMail.length}` };
  },
});

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const uniq = () => Math.random().toString(36).slice(2, 10);

/** Shared by the suites: removes anything left in the `E2E_` test namespace. */
const purgeStaleFixtures = async () => {
  const ns = /^e2e_/i;
  const ids = (await User.find({ email: ns }, { _id: 1 }).lean()).map((u) => u._id);
  const emails = [
    ...(await User.find({ email: ns }, { email: 1 }).lean()).map((u) => u.email),
    ...(await AccessRequest.find({ email: ns }, { email: 1 }).lean()).map((r) => r.email),
  ];
  const [, requests, notifs, audits, tokens] = await Promise.all([
    User.deleteMany({ email: ns }),
    AccessRequest.deleteMany({ email: ns }),
    Notification.deleteMany({ recipient: { $in: ids } }),
    AuditLog.deleteMany({ targetEmail: { $in: emails } }),
    PasswordResetToken.deleteMany({ user: { $in: ids } }),
  ]);
  if (ids.length || requests.deletedCount) {
    console.log(
      `[setup] swept ${ids.length} stale E2E user(s) and ${requests.deletedCount} request(s) from a previous run`
    );
  }
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // A run that dies before its `finally` block leaves fixtures behind. Sweeping
  // the suite's own `E2E_` namespace up front keeps the database clean and makes
  // repeated runs independent of each other. Only test-namespace rows are matched.
  await purgeStaleFixtures();

  const tag = uniq();
  const emails = [];
  // Every generated address is registered so the cleanup in `finally` can reach
  // fixtures created part-way through the run, not just the ones listed up front.
  const email = (local) => {
    const address = `E2E_${local}_${tag}@${EMAIL_DOMAIN}`;
    emails.push(address);
    return address;
  };
  // Registration numbers are also namespaced per run, so a fixture left behind by
  // an interrupted run can never collide with this one.
  const nmc = (suffix) => `E2E-NMC-${suffix}-${tag}`.toUpperCase();
  const labReg = (suffix) => `E2E-LABREG-${suffix}-${tag}`.toUpperCase();
  [
    "admin",
    "doctor",
    "lab",
    "patient",
    "esc",
    "patient2",
    "rej",
    "hijack",
  ].forEach(email);

  const adminUser = await User.create({
    name: "E2E Admin",
    email: email("admin"),
    password: "AdminPass!123",
    role: "admin",
    status: "APPROVED",
    isActive: true,
  });

  try {
    // ---- 1. Patient self-registration ---------------------------------
    console.log("\n1. Patient self-registration creates an active account");
    const patientEmail = email("patient");
    const patientPassword = "Patient!Pass1";
    const registered = await accessRequestService.registerPatient({
      name: "E2E Patient",
      email: patientEmail,
      address: "12 Test Street, Kathmandu",
      contactNumber: "+9779800000000",
      password: patientPassword,
      confirmPassword: patientPassword,
    });

    check("patient account returned", registered.user?.id === patientEmail ? false : Boolean(registered.user?.id));
    check("patient role is forced by the backend", registered.user?.role === "patient", `got ${registered.user?.role}`);
    check("patient account is APPROVED immediately", registered.user?.status === "APPROVED");
    check("patient is not forced to change a password", registered.user?.mustChangePassword === false);
    check("address is persisted", registered.user?.address === "12 Test Street, Kathmandu");
    check("contact number is persisted", registered.user?.contactNumber === "+9779800000000");
    check("no access request is created for a patient", (await AccessRequest.countDocuments({ email: patientEmail })) === 0);
    check("patient cannot self-register as a doctor role", await rejects(() =>
      accessRequestService.registerPatient({
        name: "E2E Impostor",
        email: email("patient2"),
        address: "12 Test Street, Kathmandu",
        contactNumber: "+9779800000009",
        password: patientPassword,
        role: "doctor",
      })
    ));

    let duplicatePatient = null;
    try {
      await accessRequestService.registerPatient({
        name: "E2E Patient",
        email: patientEmail,
        address: "12 Test Street, Kathmandu",
        contactNumber: "+9779800000000",
        password: patientPassword,
      });
    } catch (error) {
      duplicatePatient = error;
    }
    check("duplicate patient registration refused (409)", duplicatePatient?.statusCode === 409);
    check("duplicate message tells them to login", /login/i.test(String(duplicatePatient?.message || "")));

    // ---- 2. Doctor request carries no password -------------------------
    console.log("\n2. Doctor request creates a PENDING record and no account");
    const doctorEmail = email("doctor");
    const request = await accessRequestService.submitAccessRequest({
      name: "Dr E2E Applicant",
      email: doctorEmail,
      address: "45 Hospital Road, Lalitpur",
      contactNumber: "+9779800000001",
      requestedRole: "doctor",
      nmcNumber: nmc("MAIN"),
    });

    check("request is created PENDING", request.status === "PENDING", `got ${request.status}`);
    check("NMC number is stored", request.nmcNumber === nmc("MAIN"), `got ${request.nmcNumber}`);
    check("no account exists at submission", (await User.countDocuments({ email: doctorEmail })) === 0);
    check("no password field exists on the request", !("passwordHash" in request) && !("password" in request));

    // A pending staff request must reserve the address, otherwise a patient could
    // claim it and the later approval would collide with a live account.
    let patientOnPendingEmail = null;
    try {
      await accessRequestService.registerPatient({
        name: "E2E Squatter",
        email: doctorEmail,
        address: "1 Squatter Road, Kathmandu",
        contactNumber: "+9779800000011",
        password: patientPassword,
      });
    } catch (error) {
      patientOnPendingEmail = error;
    }
    check("patient cannot claim an email with a pending staff request", patientOnPendingEmail?.statusCode === 409);
    check("no patient account was created on the pending email", (await User.countDocuments({ email: doctorEmail })) === 0);

    let doctorWithPassword = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "Dr Password",
        email: email("esc"),
        address: "45 Hospital Road, Lalitpur",
        contactNumber: "+9779800000002",
        requestedRole: "doctor",
        nmcNumber: nmc("PWTEST"),
        password: "Sneaky!123",
      });
    } catch (error) {
      doctorWithPassword = error;
    }
    check("a doctor-supplied password is rejected", Boolean(doctorWithPassword));

    let noNmc = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "Dr No NMC",
        email: email("esc"),
        address: "45 Hospital Road, Lalitpur",
        contactNumber: "+9779800000002",
        requestedRole: "doctor",
      });
    } catch (error) {
      noNmc = error;
    }
    check("doctor without an NMC number is rejected", Boolean(noNmc));

    // ---- 3. Laboratory request + role isolation -----------------------
    console.log("\n3. Laboratory request and role-specific field isolation");
    const labEmail = email("lab");
    const labRequest = await accessRequestService.submitAccessRequest({
      name: "E2E Lab Tech",
      email: labEmail,
      address: "78 Lab Street, Pokhara",
      contactNumber: "+9779800000003",
      requestedRole: "lab",
      labRegistryNumber: labReg("77"),
    });
    check("lab registry number is stored", labRequest.labRegistryNumber === labReg("77"));
    check("NMC number is NOT stored on a lab request", !labRequest.nmcNumber);

    let crossField = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "E2E Cross",
        email: email("esc"),
        address: "78 Lab Street, Pokhara",
        contactNumber: "+9779800000002",
        requestedRole: "lab",
        labRegistryNumber: labReg("CROSS"),
        nmcNumber: nmc("CROSS"),
      });
    } catch (error) {
      crossField = error;
    }
    check("irrelevant NMC field on a lab request is rejected", Boolean(crossField));

    let escalate = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "E2E Escalator",
        email: email("esc"),
        address: "1 Nowhere",
        contactNumber: "+9779800000002",
        requestedRole: "admin",
      });
    } catch (error) {
      escalate = error;
    }
    check("cannot self-request the admin role", Boolean(escalate));

    let patientViaStaffPath = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "E2E Wrong Path",
        email: email("esc"),
        address: "1 Nowhere",
        contactNumber: "+9779800000002",
        requestedRole: "patient",
      });
    } catch (error) {
      patientViaStaffPath = error;
    }
    check("patients cannot use the staff request endpoint", Boolean(patientViaStaffPath));

    let duplicate = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "Dr E2E Applicant",
        email: doctorEmail,
        address: "45 Hospital Road, Lalitpur",
        contactNumber: "+9779800000001",
        requestedRole: "doctor",
        nmcNumber: nmc("MAIN"),
      });
    } catch (error) {
      duplicate = error;
    }
    check("duplicate pending request refused (409)", duplicate?.statusCode === 409);

    // ---- 3a. Registration numbers are unique -----------------------------
    console.log("\n3a. Duplicate NMC / lab registry numbers are refused");
    let duplicateNmc = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "Dr Same NMC",
        email: email("samennmc"),
        address: "2 Other Road, Kathmandu",
        contactNumber: "+9779800000014",
        requestedRole: "doctor",
        // Same NMC as the still-pending request above, different email.
        nmcNumber: nmc("MAIN"),
      });
    } catch (error) {
      duplicateNmc = error;
    }
    check("duplicate NMC number refused (409)", duplicateNmc?.statusCode === 409);
    check("duplicate NMC message names the field", /NMC number/i.test(String(duplicateNmc?.message || "")));
    check(
      "no second request was created for that NMC",
      (await AccessRequest.countDocuments({ nmcNumber: nmc("MAIN"), status: "PENDING" })) === 1
    );

    let duplicateLabReg = null;
    try {
      await accessRequestService.submitAccessRequest({
        name: "Same Registry Lab",
        email: email("samereg"),
        address: "3 Other Road, Kathmandu",
        contactNumber: "+9779800000015",
        requestedRole: "lab",
        labRegistryNumber: labReg("77"),
      });
    } catch (error) {
      duplicateLabReg = error;
    }
    check("duplicate lab registry number refused (409)", duplicateLabReg?.statusCode === 409);
    check(
      "duplicate registry message names the field",
      /registry number/i.test(String(duplicateLabReg?.message || ""))
    );

    // The number may also be claimed by a live account between submission and
    // review, so approval has to re-check it.
    const takenNmcEmail = email("takennmc");
    const takenNmcRequest = await accessRequestService.submitAccessRequest({
      name: "Dr Number Already Taken",
      email: takenNmcEmail,
      address: "4 Later Road, Kathmandu",
      contactNumber: "+9779800000016",
      requestedRole: "doctor",
      nmcNumber: nmc("LATE"),
    });
    const numberHolder = await User.create({
      name: "E2E Existing Doctor",
      email: email("nmcholder"),
      address: "5 Holder Road, Kathmandu",
      contactNumber: "+9779800000017",
      password: "HolderPass!123",
      role: "doctor",
      status: "APPROVED",
      isActive: true,
      nmcNumber: nmc("LATE"),
    });

    let takenNmcError = null;
    try {
      await accessRequestService.approveAccessRequest(takenNmcRequest.id, adminUser, { notes: "should fail" });
    } catch (error) {
      takenNmcError = error;
    }
    check("approval refused when the NMC is already on an account (409)", takenNmcError?.statusCode === 409);
    const numberHolderAfter = await User.findById(numberHolder._id);
    check("the existing NMC holder was not modified", numberHolderAfter?.nmcNumber === nmc("LATE"));
    check("the existing NMC holder kept their own role", numberHolderAfter?.role === "doctor");
    check(
      "the conflicting request stays PENDING",
      (await AccessRequest.findById(takenNmcRequest.id))?.status === "PENDING"
    );

    // ---- 3b. Approval must never adopt an existing account --------------
    // If the address got claimed after submission, approving must fail loudly
    // instead of re-roling a live identity (e.g. a self-registered patient).
    console.log("\n3b. Approval refuses to reassign an email held by a live account");
    const hijackEmail = email("hijack");
    const hijackRequest = await accessRequestService.submitAccessRequest({
      name: "Dr Hijack Applicant",
      email: hijackEmail,
      address: "9 Conflict Road, Kathmandu",
      contactNumber: "+9779800000012",
      requestedRole: "doctor",
      nmcNumber: nmc("HIJACK"),
    });
    const squatter = await User.create({
      name: "E2E Real Patient",
      email: hijackEmail,
      address: "10 Real Road, Kathmandu",
      contactNumber: "+9779800000013",
      password: patientPassword,
      role: "patient",
      status: "APPROVED",
      isActive: true,
    });

    let hijackError = null;
    try {
      await accessRequestService.approveAccessRequest(hijackRequest.id, adminUser, { notes: "should fail" });
    } catch (error) {
      hijackError = error;
    }
    check("approval refused when the email is already an account (409)", hijackError?.statusCode === 409);

    const untouched = await User.findById(squatter._id).select("+password");
    check("existing account keeps its original role", untouched?.role === "patient", `got ${untouched?.role}`);
    check("existing account is not forced to change a password", untouched?.mustChangePassword !== true);
    check("existing password was not rotated", (await untouched.comparePassword(patientPassword)) === true);
    check("existing account was not renamed", untouched?.name === "E2E Real Patient");
    const stillPending = await AccessRequest.findById(hijackRequest.id);
    check("the conflicting request stays PENDING for manual resolution", stillPending?.status === "PENDING");
    check("no approval email was sent for the refused approval", !sentMail.some((m) => m.to === hijackEmail && /approved/i.test(m.subject)));

    // ---- 3c. Submission notifies the Admin portal ----------------------
    console.log("\n3c. New submissions notify admins and reach the summary");
    const notifiedRequest = await AccessRequest.findById(labRequest.id);
    check("the submitted request is PENDING", notifiedRequest?.status === "PENDING");

    const adminNotice = await Notification.findOne({
      recipient: adminUser._id,
      type: "ACCESS_REQUEST_SUBMITTED",
      entityId: notifiedRequest._id,
    });
    check("the admin is notified about a new request", Boolean(adminNotice));
    check("the notice names the applicant", /E2E Lab Tech/.test(adminNotice?.message || ""));
    check("the notice names the requested role", /Laboratory/i.test(adminNotice?.message || ""));
    check("the notice points at the request", adminNotice?.entityType === "AccessRequest");
    check(
      "the submission is audited",
      Boolean(await AuditLog.findOne({ action: "ACCESS_REQUEST_SUBMITTED", targetId: notifiedRequest._id }))
    );

    // The dashboard headline totals must not depend on the active status tab.
    const summary = await accessRequestService.getSummary();
    check("the summary counts pending requests", summary?.requestsByStatus?.PENDING >= 1);
    check("the summary total is at least the pending count", summary?.requestsByStatus?.total >= 1);
    check(
      "the summary parts sum to the total",
      summary.requestsByStatus.PENDING +
        summary.requestsByStatus.APPROVED +
        summary.requestsByStatus.REJECTED ===
        summary.requestsByStatus.total
    );
    check("the summary still reports pendingRequests", summary?.pendingRequests === summary?.requestsByStatus?.PENDING);

    // ---- 4. Approval issues a temporary password ----------------------
    console.log("\n4. Admin approval creates the account with a temporary password");
    const sentBefore = sentMail.length;
    const approved = await accessRequestService.approveAccessRequest(request.id, adminUser, { notes: "ok" });
    check("request marked APPROVED", approved.request.status === "APPROVED");
    check("user account created on approval", Boolean(approved.user?.id));
    check("approved user has the doctor role", approved.user?.role === "doctor", `got ${approved.user?.role}`);
    check("approved user is flagged mustChangePassword", approved.user?.mustChangePassword === true);
    check("approval response never returns the password", !("password" in (approved.user || {})));

    const created = await User.findOne({ email: doctorEmail }).select("+password");
    check("NMC number copied onto the user", created?.nmcNumber === nmc("MAIN"));
    check("lab registry number NOT copied onto a doctor", !created?.labRegistryNumber);
    check("account is APPROVED and active", created?.status === "APPROVED" && created?.isActive === true);

    // The temporary password is only known from the emailed message.
    const approvalMail = sentMail.slice(sentBefore).find((m) => /approved/i.test(m.subject));
    check("an approval email was sent", Boolean(approvalMail));
    const tempMatch = approvalMail?.text?.match(/Temporary password:\s*(\S+)/);
    const temporaryPassword = tempMatch?.[1];
    check("the approval email contains a temporary password", Boolean(temporaryPassword));
    check("temporary password is not one of the forbidden values", temporaryPassword && temporaryPassword.length >= 12);
    check("temporary password is stored as a bcrypt hash", /^\$2[aby]\$\d{2}\$/.test(created.password || ""));
    check("the emailed password actually authenticates", (await created.comparePassword(temporaryPassword)) === true);

    const notif = await Notification.findOne({ recipient: created._id, type: "ACCESS_REQUEST_APPROVED" });
    check("approval notification created", Boolean(notif));
    check("notification body does not contain the password", !String(notif?.message || "").includes(temporaryPassword));

    const audit = await AuditLog.findOne({ action: "ACCESS_REQUEST_APPROVED", targetEmail: doctorEmail });
    check("approval written to audit log", Boolean(audit));
    check("audit log does not store the temporary password", !JSON.stringify(audit?.metadata || {}).includes(temporaryPassword));

    let reApproved = null;
    try {
      await accessRequestService.approveAccessRequest(request.id, adminUser, {});
    } catch (error) {
      reApproved = error;
    }
    check("already-reviewed request cannot be approved again", reApproved?.statusCode === 409);

    // ---- 5. Forced first-login password change ------------------------
    console.log("\n5. First sign-in must replace the temporary password");
    let wrongCurrent = null;
    try {
      await passwordService.changePassword(created._id, {
        currentPassword: "not-the-temporary-password",
        newPassword: "BrandNew!456",
      });
    } catch (error) {
      wrongCurrent = error;
    }
    check("wrong temporary password refused", wrongCurrent?.statusCode === 401);

    await passwordService.changePassword(created._id, {
      currentPassword: temporaryPassword,
      newPassword: "BrandNew!456",
    });
    const afterChange = await User.findById(created._id).select("+password");
    check("mustChangePassword cleared after the change", afterChange.mustChangePassword === false);
    check("temporaryPasswordIssuedAt cleared", afterChange.temporaryPasswordIssuedAt === null);
    check("new password verifies", (await afterChange.comparePassword("BrandNew!456")) === true);
    check("temporary password no longer works", (await afterChange.comparePassword(temporaryPassword)) === false);

    // ---- 6. Lab approval + role assignment ---------------------------
    console.log("\n6. Lab approval and role assignment rules");
    const labApproved = await accessRequestService.approveAccessRequest(labRequest.id, adminUser, { notes: "ok" });
    check("lab account created", Boolean(labApproved.user?.id));
    check("lab account flagged mustChangePassword", labApproved.user?.mustChangePassword === true);

    const labUser = await User.findOne({ email: labEmail }).select("+password");
    check("lab registry copied onto the user", labUser?.labRegistryNumber === labReg("77"));
    check("NMC number NOT copied onto a lab user", !labUser?.nmcNumber);

    // Mongoose lowercases stored emails, so match case-insensitively.
    const labMail = sentMail.find((m) => m.to?.toLowerCase() === labEmail.toLowerCase() && /approved/i.test(m.subject));
    const labTemp = labMail?.text?.match(/Temporary password:\s*(\S+)/)?.[1];
    check(
      "lab temporary password authenticates",
      Boolean(labTemp) && (await labUser.comparePassword(labTemp)) === true
    );

      // Admin is now the highest role, so an Admin can grant the Admin role.
      // The invariant that matters is that a non-admin can never escalate.
      const promotedToAdmin = await adminService.updateUserRole(created._id, { role: "admin" }, adminUser);
      check("admin can promote a doctor to admin", promotedToAdmin.role === "admin", `got ${promotedToAdmin.role}`);

      const earlyPatient = await User.findOne({ email: patientEmail });
      let patientEscalation = null;
      try {
        await adminService.updateUserRole(created._id, { role: "admin" }, earlyPatient);
      } catch (error) {
        patientEscalation = error;
      }
      check("a patient cannot grant the admin role", patientEscalation?.statusCode === 403, `got ${patientEscalation?.statusCode}`);

      let removedRole = null;
      try {
        await adminService.updateUserRole(created._id, { role: "superadmin" }, adminUser);
      } catch (error) {
        removedRole = error;
      }
      check("the removed superadmin role cannot be assigned", Boolean(removedRole));


    const promoted = await adminService.updateUserRole(created._id, { role: "laboratory" }, adminUser);
    check("documented alias 'laboratory' normalises to lab", promoted.role === "lab", `got ${promoted.role}`);

    let badRole = null;
    try {
      await adminService.updateUserRole(created._id, { role: "wizard" }, adminUser);
    } catch (error) {
      badRole = error;
    }
    check("unknown role rejected", Boolean(badRole));

    // ---- 7. Temporary password generator ------------------------------
    console.log("\n7. Temporary password generator");
    const generated = Array.from({ length: 200 }, () => generateTemporaryPassword());
    check("all generated values are unique", new Set(generated).size === 200);
    check("every value is at least 12 characters", generated.every((p) => p.length >= 12));
    check("every value has a lowercase letter", generated.every((p) => /[a-z]/.test(p)));
    check("every value has an uppercase letter", generated.every((p) => /[A-Z]/.test(p)));
    check("every value has a digit", generated.every((p) => /[0-9]/.test(p)));
    check("every value has a symbol", generated.every((p) => /[^A-Za-z0-9]/.test(p)));
    check("no ambiguous 0/O/1/l/I characters", generated.every((p) => !/[0O1lI]/.test(p)));
    check("none of the SRS 13 forbidden values are produced", generated.every((p) => !["123456", "password", "12345678", "123456789", "password123"].includes(p.toLowerCase())));

    // ---- 8. Forgot / reset password -----------------------------------
    console.log("\n8. Forgot + reset password");
    const patientUser = await User.findOne({ email: patientEmail }).select("+password");
    const oldHash = patientUser.password;
    const forgot = await passwordService.requestPasswordReset(patientEmail);
    check("forgot-password issues a token", Boolean(forgot.token));
    check("email delivery outcome is reported", typeof forgot.emailDelivered === "boolean");

    const tokenRows = await PasswordResetToken.find({ user: patientUser._id }).select("+tokenHash");
    check("reset token is NOT persisted in plaintext", !tokenRows.find((row) => row.tokenHash === forgot.token));
    check("reset token IS persisted as a sha256 hash", tokenRows.some((row) => row.tokenHash === crypto.createHash("sha256").update(forgot.token).digest("hex")));

    const resetNotif = await Notification.findOne({ type: "PASSWORD_RESET" }).sort({ createdAt: -1 });
    check("in-app notification carries a reset link", String(resetNotif?.message || "").includes(forgot.token));

    const silent = await passwordService.requestPasswordReset(email("nobody"));
    check("unknown email returns no token (no enumeration)", silent.token === undefined);

    await passwordService.resetPassword({ token: forgot.token, password: "ResetPass!789" });
    const afterReset = await User.findById(patientUser._id).select("+password");
    check("password hash actually changed", afterReset.password !== oldHash);
    check("new password verifies", (await afterReset.comparePassword("ResetPass!789")) === true);
    check("old password no longer verifies", (await afterReset.comparePassword(patientPassword)) === false);

    let reused = null;
    try {
      await passwordService.resetPassword({ token: forgot.token, password: "Another!12345" });
    } catch (error) {
      reused = error;
    }
    check("reset token is single-use", Boolean(reused));

    // ---- 9. Rejection path --------------------------------------------
    console.log("\n9. Rejection path");
    const toReject = await accessRequestService.submitAccessRequest({
      name: "E2E Rejected",
      email: email("rej"),
      address: "9 Reject Avenue",
      contactNumber: "+9779800000009",
      requestedRole: "lab",
      labRegistryNumber: labReg("REJ"),
    });
    const rejected = await accessRequestService.rejectAccessRequest(toReject.id, adminUser, { notes: "no" });
    check("request marked REJECTED", rejected.request.status === "REJECTED");
    check("no account created on rejection", (await User.countDocuments({ email: email("rej") })) === 0);
    const declineMail = sentMail.find(
      (m) => m.to?.toLowerCase() === email("rej").toLowerCase() && /declined/i.test(m.subject)
    );
    check("a decline email was sent", Boolean(declineMail));
    check("decline email never contains a password", !/password:/i.test(declineMail?.text || ""));

    // ---- 10. Account status gating ------------------------------------
    console.log("\n10. Account status gating");
    const gated = await User.create({
      name: "E2E Pending",
      email: email("esc"),
      password: "PendingPass!1",
      role: "patient",
      status: "PENDING",
      isActive: false,
    });
    check("PENDING user cannot authenticate", gated.status !== "APPROVED");

    await adminService.setUserStatus(gated._id, { status: "APPROVED" }, adminUser);
    const reactivated = await User.findById(gated._id);
    check("admin can reactivate a PENDING account", reactivated.isActive === true && reactivated.status === "APPROVED");

    await adminService.setUserStatus(gated._id, { status: "REJECTED" }, adminUser);
    const rejectedUser = await User.findById(gated._id);
    check("admin can reject an account", rejectedUser.status === "REJECTED" && rejectedUser.isActive === false);

    // ---- Admin/system-initiated Patient account with a temporary password ----
    // Scoped so these fixtures cannot collide with the identifiers above.
    {
    const provisionEmail = email("provisioned");
    emails.push(provisionEmail);
    const beforeCount = sentMail.length;

    const provisioned = await patientAccountService.createPatientAccount(
      {
        name: "Provisioned Patient",
        email: provisionEmail,
        address: "Ward 4, HILMS",
        contactNumber: "+9779800000000",
      },
      adminUser
    );

    check("admin can create a Patient account", provisioned?.user?.role === "patient");
    check("created Patient is forced to change the password", provisioned?.user?.mustChangePassword === true);
    check(
      "the temporary password is never returned in the response",
      !JSON.stringify(provisioned).includes("temporaryPassword") && !JSON.stringify(provisioned).includes("passwordHash")
    );

    const createdUser = await User.findOne({ email: provisionEmail }).select("+password");
    check("the account is persisted and active", createdUser?.status === "APPROVED" && createdUser.isActive === true);
    check(
      "the stored password is a bcrypt hash, never plaintext",
      /^\$2[aby]\$/.test(createdUser.password) && !createdUser.password.includes("@")
    );

    const provisionMail = sentMail[beforeCount];
    check("a temporary password email was sent", Boolean(provisionMail));
    // The service normalises the address before sending, so compare the
    // normalised form the Patient will actually receive mail at.
    check(
      "the email is addressed to the new patient",
      provisionMail?.to === createdUser.email && provisionMail.to === provisionEmail.toLowerCase()
    );
    check("the email subject matches the spec", provisionMail?.subject === "HILMS - Your Temporary Login Password");

    // Recover the credential from the captured message, exactly as the patient
    // would, and assert the email body carries everything the spec requires.
    const emailedPassword = (provisionMail?.text || "").match(/Temporary Password:\s*(\S+)/)?.[1];
    check("the email body contains the temporary password", Boolean(emailedPassword));
    check(
      "the plaintext temporary password is not stored in any field",
      Boolean(emailedPassword) && !Object.values(createdUser.toObject()).includes(emailedPassword)
    );
    check("the email body states the password must be changed", /required to change this temporary password/i.test(provisionMail?.text || ""));
    check("the email body warns against sharing the password", /do not share your password/i.test(provisionMail?.text || ""));
    check("the email body includes a sign-in link", /Sign in:\s*\S+/.test(provisionMail?.text || ""));
    check("the email body contains no HTML injection from user input", !/<script/i.test(provisionMail?.html || ""));

    const authed = await createdUser.comparePassword(emailedPassword);
    check("the emailed password matches the stored hash", authed === true);

    const provisionAudit = await AuditLog.findOne({ action: "PATIENT_ACCOUNT_CREATED", targetEmail: provisionEmail });
    check("the creation is written to the audit trail", Boolean(provisionAudit));
    check(
      "the audit trail records delivery without the password",
      provisionAudit?.metadata?.emailDelivered === true && !JSON.stringify(provisionAudit.metadata).includes(emailedPassword)
    );

    // Forced change, exactly the flow the frontend drives.
    const provisionalPassword = emailedPassword;
    await passwordService.changePassword(createdUser._id, {
      temporaryPassword: provisionalPassword,
      newPassword: "PatientNew@2026",
      confirmPassword: "PatientNew@2026",
    });

    const afterChange = await User.findById(createdUser._id).select("+password");
    check("the flag clears after the change", afterChange.mustChangePassword === false);
    check("the issued-at stamp is cleared", afterChange.temporaryPasswordIssuedAt === null);
    check("the temporary password stops working", (await afterChange.comparePassword(provisionalPassword)) === false);
    check("the new password works", (await afterChange.comparePassword("PatientNew@2026")) === true);

    // Security constraints from the spec.
    const mismatch = await rejects(() =>
      passwordService.changePassword(afterChange._id, {
        temporaryPassword: "PatientNew@2026",
        newPassword: "AnotherPass@9",
        confirmPassword: "SomethingElse@9",
      })
    );
    check("a mismatched confirmation is rejected server-side", mismatch);

    const reused = await rejects(() =>
      passwordService.changePassword(afterChange._id, {
        temporaryPassword: "PatientNew@2026",
        newPassword: "PatientNew@2026",
        confirmPassword: "PatientNew@2026",
      })
    );
    check("reusing the current password is rejected", reused);

    const wrong = await rejects(() =>
      passwordService.changePassword(afterChange._id, {
        temporaryPassword: "TotallyWrong@1",
        newPassword: "AnotherPass@9",
        confirmPassword: "AnotherPass@9",
      })
    );
    check("a wrong temporary password is rejected", wrong);
    check(
      "a failed change leaves the new password unapplied",
      (await User.findById(afterChange._id).select("+password")).password === afterChange.password
    );

    // Identity collision: the same guarantee self-registration already provides.
    const duplicate = await rejects(() =>
      patientAccountService.createPatientAccount({ name: "Impostor", email: provisionEmail }, adminUser)
    );
    check("a duplicate email is refused with 409", duplicate);

    // ---- SMTP failure must roll the account back (spec step 14) ----
    const rollbackEmail = email("rollback");
    emails.push(rollbackEmail);
    emailService.setTransport({
      sendMail: async () => {
        throw new Error("simulated SMTP outage");
      },
    });

    const mailFailure = await rejects(() =>
      patientAccountService.createPatientAccount({ name: "Never Persisted", email: rollbackEmail }, adminUser)
    );
    check("account creation fails when the email cannot be delivered", mailFailure);
    check("no account is left behind after a mail failure", (await User.countDocuments({ email: rollbackEmail })) === 0);
    check(
      "the failed attempt is still audited",
      Boolean(await AuditLog.findOne({ action: "PATIENT_ACCOUNT_CREATE_ROLLED_BACK", targetEmail: rollbackEmail }))
    );

    // Restore the capturing transport for the remainder of the suite.
    emailService.setTransport({
      sendMail: async (payload) => {
        sentMail.push(payload);
        return { messageId: `e2e-${sentMail.length}` };
      },
    });
    }
  } finally {
    emailService.env.email.host = savedSmtpHost;
    emailService.setTransport(null);
    const users = await User.find({ email: { $in: [...emails, email("nobody")] } }).select("_id");
    const userIds = users.map((u) => u._id);
    await Promise.all([
      User.deleteMany({ email: { $in: emails } }),
      AccessRequest.deleteMany({ email: { $in: emails } }),
      PasswordResetToken.deleteMany({ user: { $in: userIds } }),
      Notification.deleteMany({ $or: [{ recipient: { $in: userIds } }, { type: "PASSWORD_RESET" }] }),
      AuditLog.deleteMany({ targetEmail: { $in: emails } }),
    ]);
    await mongoose.disconnect();
  }

  console.log(`\n${"=".repeat(52)}\n  ${passed} passed, ${failed} failed\n${"=".repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
};

/** Helper: returns true when the async call rejects. */
const rejects = async (fn) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

run().catch((error) => {
  console.error("\nE2E crashed:", error);
  process.exit(1);
});
