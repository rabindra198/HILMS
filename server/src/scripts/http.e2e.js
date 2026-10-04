/**
 * HTTP-layer verification of the revised authentication workflow. Boots the
 * real Express app against the configured MongoDB, then exercises routing,
 * validation, auth gating, RBAC and the forced first-login password change
 * over HTTP. Test data is namespaced with E2E_@ and removed on completion.
 */
const mongoose = require("mongoose");
require("dotenv").config();

const app = require("../app");
const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const PasswordResetToken = require("../models/PasswordResetToken");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/email.service");

// Route outbound mail into memory so the temporary password issued on approval
// can be asserted on without contacting a real SMTP server.
const sentMail = [];
const savedSmtpHost = emailService.env.email.host;
emailService.env.email.host = "smtp.test.local";
emailService.setTransport({
  sendMail: async (payload) => {
    sentMail.push(payload);
    return { messageId: `http-e2e-${sentMail.length}` };
  },
});

/**
 * The API is not uniformly enveloped: /auth/login and /auth/me return a flat
 * payload while the /admin and /super-admin routes return { success, data }.
 * The client's axios layer unwraps both; this helper does the same.
 */
const unwrap = (body) => body?.data ?? body ?? {};

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL_DOMAIN = "e2e.io";

let passed = 0;
let failed = 0;
let server;

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

/**
 * Removes anything left in the suites' `E2E_` namespace. A run that dies before
 * its cleanup block would otherwise strand test accounts - including ones with
 * admin and superadmin roles - in the real database.
 */
const purgeStaleFixtures = async () => {
  const ns = /^e2e_/i;
  const ids = (await User.find({ email: ns }, { _id: 1 }).lean()).map((u) => u._id);
  const emails = [
    ...(await User.find({ email: ns }, { email: 1 }).lean()).map((u) => u.email),
    ...(await AccessRequest.find({ email: ns }, { email: 1 }).lean()).map((r) => r.email),
  ];
  const [, requests, notifs, audits] = await Promise.all([
    User.deleteMany({ email: ns }),
    AccessRequest.deleteMany({ email: ns }),
    Notification.deleteMany({ recipient: { $in: ids } }),
    AuditLog.deleteMany({ targetEmail: { $in: emails } }),
  ]);
  if (ids.length || requests.deletedCount) {
    console.log(
      `[setup] swept ${ids.length} stale E2E user(s) and ${requests.deletedCount} request(s) from a previous run`
    );
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
  return { status: res.status, data };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await purgeStaleFixtures();
  server = app.listen(PORT);

  const tag = uniq();
  // Registration numbers are namespaced per run so a fixture left behind by an
  // interrupted run can never trip the new uniqueness rules.
  const nmc = (suffix) => `HTTP-NMC-${suffix}-${tag}`.toUpperCase();
  const labReg = (suffix) => `HTTP-LABREG-${suffix}-${tag}`.toUpperCase();
  const email = (local) => `E2E_${local}_${tag}@${EMAIL_DOMAIN}`;
  const adminEmail = email("hadm");
  const pendingEmail = email("hpend");
  const applicantEmail = email("hdoc");
  const patientEmail = email("hpat");
  const patientPassword = "Patient!Pass1";
  // Section 14 provisions more accounts. Every address is listed up front so
  // the cleanup in `finally` removes them even if a check throws mid-run.
  const emails = [
    adminEmail,
    pendingEmail,
    applicantEmail,
    patientEmail,
    email("hbad"),
    email("hnew"),
    email("hself"),
    email("hbadpw"),
    email("hrole"),
    email("hnoname"),
  ];

  try {
    await User.create([
      { name: "E2E HTTP Admin", email: adminEmail, password: "AdminPass!123", role: "admin", status: "APPROVED", isActive: true },
      { name: "E2E HTTP Pending", email: pendingEmail, password: "PendPass!123", role: "doctor", status: "PENDING", isActive: false },
    ]);

    // ---- 1. Health ------------------------------------------------------
    console.log("\n1. Health endpoint (proxy-stripped path)");
    const health = await call("GET", "/health");
    check("GET /health responds 200", health.status === 200, `got ${health.status}`);
    const healthApi = await call("GET", "/api/health");
    check("GET /api/health also responds 200", healthApi.status === 200, `got ${healthApi.status}`);

    // ---- 2. No generic public registration ------------------------------
    console.log("\n2. Generic public registration removed");
    const signup = await call("POST", "/auth/signup", { body: { name: "X", email: email("hx"), password: "abc123" } });
    check("POST /auth/signup is 404", signup.status === 404, `got ${signup.status}`);
    const register = await call("POST", "/auth/register", { body: { name: "X", email: email("hx"), password: "abc123" } });
    check("POST /auth/register is 404", register.status === 404, `got ${register.status}`);

    // ---- 3. Patient self-registration -----------------------------------
    console.log("\n3. Patient self-registration over HTTP");
    const patient = await call("POST", "/auth/register/patient", {
      body: {
        name: "E2E HTTP Patient",
        email: patientEmail,
        address: "10 HTTP Street, Kathmandu",
        contactNumber: "+9779811111111",
        password: patientPassword,
        confirmPassword: patientPassword,
      },
    });
    check("patient registration returns 201", patient.status === 201, `got ${patient.status} ${JSON.stringify(patient.data)}`);
    check("patient response is APPROVED", unwrap(patient.data).user?.status === "APPROVED");
    check("patient response role is patient", unwrap(patient.data).user?.role === "patient");

    const patientLogin = await call("POST", "/auth/login", { body: { email: patientEmail, password: patientPassword } });
    check("patient can log in immediately (no approval needed)", patientLogin.status === 200, `got ${patientLogin.status}`);

    const mismatch = await call("POST", "/auth/register/patient", {
      body: {
        name: "E2E HTTP Patient",
        email: email("hbad"),
        address: "10 HTTP Street, Kathmandu",
        contactNumber: "+9779811111111",
        password: patientPassword,
        confirmPassword: "Different!123",
      },
    });
    check("mismatched password confirmation is 400", mismatch.status === 400, `got ${mismatch.status}`);

    const patientAsDoctor = await call("POST", "/auth/register/patient", {
      body: {
        name: "E2E Impostor",
        email: email("hbad"),
        address: "10 HTTP Street, Kathmandu",
        contactNumber: "+9779811111111",
        password: patientPassword,
        role: "doctor",
      },
    });
    check("patient endpoint refuses a non-patient role", patientAsDoctor.status === 400, `got ${patientAsDoctor.status}`);

    const patientNmc = await call("POST", "/auth/register/patient", {
      body: {
        name: "E2E Impostor",
        email: email("hbad"),
        address: "10 HTTP Street, Kathmandu",
        contactNumber: "+9779811111111",
        password: patientPassword,
        nmcNumber: nmc("SNEAKY"),
      },
    });
    check("patient endpoint refuses an NMC field", patientNmc.status === 400, `got ${patientNmc.status}`);

    // ---- 4. Doctor access request ---------------------------------------
    console.log("\n4. Doctor access request over HTTP");
    const badRole = await call("POST", "/auth/access-requests", {
      body: {
        name: "Bad Role",
        email: email("hbad"),
        address: "1 Nowhere",
        contactNumber: "+9779800000000",
        requestedRole: "admin",
      },
    });
    check("admin request rejected at the API", badRole.status === 400, `got ${badRole.status}`);

    const patientViaStaff = await call("POST", "/auth/access-requests", {
      body: {
        name: "Wrong Path",
        email: email("hbad"),
        address: "1 Nowhere",
        contactNumber: "+9779800000000",
        requestedRole: "patient",
      },
    });
    check("patients refused on the staff endpoint", patientViaStaff.status === 400, `got ${patientViaStaff.status}`);

    const noNmc = await call("POST", "/auth/access-requests", {
      body: {
        name: "No NMC",
        email: email("hbad"),
        address: "1 Nowhere",
        contactNumber: "+9779800000000",
        requestedRole: "doctor",
      },
    });
    check("doctor without an NMC number is 400", noNmc.status === 400, `got ${noNmc.status}`);

    const withPassword = await call("POST", "/auth/access-requests", {
      body: {
        name: "Password Sneaky",
        email: email("hbad"),
        address: "1 Nowhere",
        contactNumber: "+9779800000000",
        requestedRole: "doctor",
        nmcNumber: nmc("NOPROFILE"),
        password: "Sneaky!123",
      },
    });
    check("doctor-supplied password is 400", withPassword.status === 400, `got ${withPassword.status}`);

    const good = await call("POST", "/auth/access-requests", {
      body: {
        name: "Dr HTTP Applicant",
        email: applicantEmail,
        address: "20 API Road, Lalitpur",
        contactNumber: "+9779800000000",
        requestedRole: "doctor",
        nmcNumber: nmc("4242"),
      },
    });
    check("valid access request accepted", good.status === 201, `got ${good.status}`);
    check("request is PENDING", unwrap(good.data)?.status === "PENDING" || good.data?.data?.status === "PENDING");
    check("no password field on the request record", !("passwordHash" in (unwrap(good.data) || {})) && !("password" in (good.data?.data || {})));

    const duplicate = await call("POST", "/auth/access-requests", {
      body: {
        name: "Dr HTTP Applicant",
        email: applicantEmail,
        address: "20 API Road, Lalitpur",
        contactNumber: "+9779800000000",
        requestedRole: "doctor",
        nmcNumber: nmc("4242"),
      },
    });
    check("duplicate request is 409", duplicate.status === 409, `got ${duplicate.status}`);

    // ---- 5. Auth gating --------------------------------------------------
    console.log("\n5. Auth + status gating over HTTP");
    const adminLogin = await call("POST", "/auth/login", { body: { email: adminEmail, password: "AdminPass!123" } });
    check("admin login succeeds", adminLogin.status === 200, `got ${adminLogin.status}`);
    const adminAuth = unwrap(adminLogin.data);
    const adminToken = adminAuth.token;
    check("login returns a token", Boolean(adminToken));
    check("login role is backend-assigned", adminAuth.user?.role === "admin");
    check("login returns permissions", Array.isArray(adminAuth.permissions) && adminAuth.permissions.length > 0);
    check("admin is not forced to change a password", adminAuth.user?.mustChangePassword === false);

    // The Super Admin role was removed. These assert it cannot be smuggled back
    // in through either public entry point.
    const legacyRoleRequest = await call("POST", "/auth/access-requests", {
      body: {
        name: "Legacy Role",
        email: email("hsadm"),
        address: "1 Nowhere",
        contactNumber: "+9779800000011",
        requestedRole: "superadmin",
      },
    });
    check(
      "legacy superadmin role rejected on the public API",
      legacyRoleRequest.status === 400,
      `got ${legacyRoleRequest.status}`
    );

    const userList = await call("GET", "/admin/users", { token: adminToken });
    const patientId = unwrap(userList.data)?.users?.[0]?._id || unwrap(userList.data)?.users?.[0]?.id;
    const legacyRoleUpdate = await call("PATCH", `/admin/users/${patientId}/role`, {
      token: adminToken,
      body: { role: "superadmin" },
    });
    check(
      "admin cannot assign the removed superadmin role",
      legacyRoleUpdate.status >= 400 && legacyRoleUpdate.status < 500,
      `got ${legacyRoleUpdate.status}`
    );

    const deadRoute = await call("GET", "/super-admin/overview", { token: adminToken });
    check("the /super-admin surface no longer exists", deadRoute.status === 404, `got ${deadRoute.status}`);

    const pendingLogin = await call("POST", "/auth/login", { body: { email: pendingEmail, password: "PendPass!123" } });
    check("PENDING account login is denied", pendingLogin.status === 403, `got ${pendingLogin.status}`);
    check("blocked user has no usable token at all", !unwrap(pendingLogin.data).token);

    const wrongPw = await call("POST", "/auth/login", { body: { email: adminEmail, password: "wrong-password" } });
    check("wrong password is 401", wrongPw.status === 401, `got ${wrongPw.status}`);

    // ---- 6. Route protection --------------------------------------------
    console.log("\n6. Protected routes require a token");
    const noToken = await call("GET", "/admin/access-requests");
    check("GET /admin/access-requests without token is 401", noToken.status === 401, `got ${noToken.status}`);

    const badToken = await call("GET", "/admin/access-requests", { token: "not-a-real-jwt" });
    check("GET /admin/access-requests with junk token is 401", badToken.status === 401, `got ${badToken.status}`);

    const adminList = await call("GET", "/admin/access-requests", { token: adminToken });
    check("admin can list access requests", adminList.status === 200, `got ${adminList.status}`);
    const listBody = unwrap(adminList.data);
    check("list is scoped and shaped correctly", Array.isArray(listBody.requests) && typeof listBody.counts?.pending === "number");
    check("list only contains doctor/lab requests", listBody.requests.every((r) => ["doctor", "lab"].includes(r.requestedRole)));
    check("list never contains patient requests", !listBody.requests.some((r) => r.requestedRole === "patient"));

    // The dashboard headline cards must show real totals, not just the rows
    // matching the active status tab, so they come from the summary endpoint.
    const summaryRes = await call("GET", "/admin/access-requests/summary", { token: adminToken });
    check("admin can read the summary", summaryRes.status === 200, `got ${summaryRes.status}`);
    const summaryBody = unwrap(summaryRes.data);
    check(
      "the summary reports counts for every status",
      ["PENDING", "APPROVED", "REJECTED", "total"].every((k) => typeof summaryBody.requestsByStatus?.[k] === "number"),
      JSON.stringify(summaryBody.requestsByStatus)
    );
    check(
      "the summary statuses sum to the total",
      summaryBody.requestsByStatus.PENDING +
        summaryBody.requestsByStatus.APPROVED +
        summaryBody.requestsByStatus.REJECTED ===
        summaryBody.requestsByStatus.total
    );
    // A status filter narrows the rows, never the counts. The PENDING tab is the
    // default, so the cards used to read 0 approved even when approved rows
    // existed. Both the list and the summary must keep reporting every status.
    const approvedOnly = await call("GET", "/admin/access-requests?status=APPROVED", { token: adminToken });
    const approvedBody = unwrap(approvedOnly.data);
    check("a status filter narrows the returned rows", approvedOnly.status === 200);
    check(
      "the filtered list returns only that status",
      approvedBody.requests.every((r) => r.status === "APPROVED")
    );
    check(
      "the status filter does not zero out the other counts",
      approvedBody.counts.pending === summaryBody.requestsByStatus.PENDING
    );
    check("the list and summary agree on the total", approvedBody.counts.total === summaryBody.requestsByStatus.total);
    check(
      "the list count parts sum to the total",
      approvedBody.counts.pending + approvedBody.counts.approved + approvedBody.counts.rejected === approvedBody.counts.total
    );
    check("pendingRequests matches the pending tally", summaryBody.pendingRequests === summaryBody.requestsByStatus.PENDING);

    // A submitted request must reach the admin portal without polling the page.
    const adminNotice = await Notification.findOne({ type: "ACCESS_REQUEST_SUBMITTED" }).sort({ createdAt: -1 });
    check("submitting a request notifies the admin", Boolean(adminNotice));
    check("the admin notice is addressed to an admin user", Boolean(adminNotice?.recipient));
    check(
      "the submission is audited with the request id",
      Boolean(await AuditLog.findOne({ action: "ACCESS_REQUEST_SUBMITTED", targetId: adminNotice?.entityId }))
    );

    // ---- 7. Admin overview + audit trail ---------------------------------
    console.log("\n7. Admin overview + audit trail over HTTP");
    const overviewRes = await call("GET", "/admin/overview", { token: adminToken });
    check("admin can read /admin/overview", overviewRes.status === 200, `got ${overviewRes.status}`);
    const overview = unwrap(overviewRes.data);
    check("overview includes roleCounts", typeof overview.roleCounts === "object" && overview.roleCounts !== null);
    check("overview includes statusCounts", typeof overview.statusCounts === "object" && overview.statusCounts !== null);
    check(
      "overview exposes no superadmin role count",
      Object.prototype.hasOwnProperty.call(overview.roleCounts, "superadmin") === false
    );

    const audit = await call("GET", "/admin/audit-logs", { token: adminToken });
    check("admin can read audit logs", audit.status === 200, `got ${audit.status}`);

    // ---- 8. Approval issues a temporary password ------------------------
    console.log("\n8. Approve, then sign in with the emailed temporary password");
    const pendingRow = await AccessRequest.findOne({ email: applicantEmail });
    const sentBefore = sentMail.length;
    const approve = await call("PATCH", `/admin/access-requests/${pendingRow.id}/approve`, {
      token: adminToken,
      body: { notes: "approved over http" },
    });
    check("admin approves the request", approve.status === 200, `got ${approve.status} ${JSON.stringify(approve.data)}`);

    const approvalMail = sentMail.slice(sentBefore).find((m) => /approved/i.test(m.subject));
    const temporaryPassword = approvalMail?.text?.match(/Temporary password:\s*(\S+)/)?.[1];
    check("an approval email was sent", Boolean(approvalMail));
    check("the approval email contains a temporary password", Boolean(temporaryPassword));

    // The only credential ever emitted is the emailed temporary password; the
    // HTTP response must contain neither a `password` key nor that value.
    check("approval response has no password field", unwrap(approve.data).user?.password === undefined);
    check(
      "approval response does not contain the temporary password",
      Boolean(temporaryPassword) && !JSON.stringify(approve.data || {}).includes(temporaryPassword)
    );

    const withSubmittedPw = await call("POST", "/auth/login", { body: { email: applicantEmail, password: "Passw0rd!Test" } });
    check("no pre-set applicant password exists", withSubmittedPw.status === 401, `got ${withSubmittedPw.status}`);

    const applicantLogin = await call("POST", "/auth/login", { body: { email: applicantEmail, password: temporaryPassword } });
    const applicantAuth = unwrap(applicantLogin.data);
    const applicantToken = applicantAuth.token;
    check("applicant can log in with the temporary password", applicantLogin.status === 200, `got ${applicantLogin.status}`);
    check("applicant received the doctor role", applicantAuth.user?.role === "doctor");
    check("login response flags mustChangePassword", applicantAuth.user?.mustChangePassword === true);

    // ---- 9. Forced password change is enforced on the backend -----------
    console.log("\n9. Forced password change blocks everything else");
    const doctorAdminAttempt = await call("GET", "/admin/access-requests", { token: applicantToken });
    check("a doctor token cannot reach the admin API", doctorAdminAttempt.status === 403, `got ${doctorAdminAttempt.status}`);

    const doctorAudit = await call("GET", "/admin/audit-logs", { token: applicantToken });
    check("a doctor token cannot read audit logs (403)", doctorAudit.status === 403, `got ${doctorAudit.status}`);

    const forcedChange = await call("PATCH", "/auth/change-password", {
      token: applicantToken,
      body: { currentPassword: temporaryPassword, newPassword: "Changed!Pass123" },
    });
    check("change-password with the temporary password succeeds", forcedChange.status === 200, `got ${forcedChange.status} ${JSON.stringify(forcedChange.data)}`);

    const afterChange = await call("GET", "/auth/me", { token: applicantToken });
    check("/auth/me no longer reports mustChangePassword", unwrap(afterChange.data).user?.mustChangePassword === false);

    const reLogin = await call("POST", "/auth/login", { body: { email: applicantEmail, password: "Changed!Pass123" } });
    check("login works with the new password", reLogin.status === 200, `got ${reLogin.status}`);
    const reAuth = unwrap(reLogin.data);
    check("re-login is no longer forced to change", reAuth.user?.mustChangePassword === false);

    const staleLogin = await call("POST", "/auth/login", { body: { email: applicantEmail, password: temporaryPassword } });
    check("the temporary password is dead after the change", staleLogin.status === 401, `got ${staleLogin.status}`);

    // ---- 10. Decline path ------------------------------------------------
    console.log("\n10. Decline path over HTTP");
    const labEmail = email("hlab");
    const labRequest = await call("POST", "/auth/access-requests", {
      body: {
        name: "E2E HTTP Lab",
        email: labEmail,
        address: "30 Lab Road, Pokhara",
        contactNumber: "+9779800000003",
        requestedRole: "lab",
        labRegistryNumber: labReg("1"),
      },
    });
    check("lab request accepted", labRequest.status === 201, `got ${labRequest.status}`);
    emails.push(labEmail);

    // ---- 10b. SRS alias + duplicate registry number over HTTP ------------
    console.log("\n10b. POST /access-requests alias and duplicate NMC over HTTP");
    const aliasEmail = email("halias");
    emails.push(aliasEmail);
    const aliasSubmit = await call("POST", "/access-requests", {
      body: {
        name: "Dr Alias Applicant",
        email: aliasEmail,
        address: "31 Alias Road, Pokhara",
        contactNumber: "+9779800000004",
        requestedRole: "doctor",
        nmcNumber: nmc("ALIAS"),
      },
    });
    check("SRS alias POST /access-requests accepted", aliasSubmit.status === 201, `got ${aliasSubmit.status}`);

    const dupNmcEmail = email("hdupnmc");
    emails.push(dupNmcEmail);
    const dupNmc = await call("POST", "/access-requests", {
      body: {
        name: "Dr Duplicate NMC",
        email: dupNmcEmail,
        address: "32 Dup Road, Pokhara",
        contactNumber: "+9779800000005",
        requestedRole: "doctor",
        // Same NMC as the alias request, different email.
        nmcNumber: nmc("ALIAS"),
      },
    });
    check("duplicate NMC number is 409 over HTTP", dupNmc.status === 409, `got ${dupNmc.status}`);

    const badEmail = await call("POST", "/access-requests", {
      body: {
        name: "Dr Bad Email",
        email: "not-an-email",
        address: "33 Bad Road, Pokhara",
        contactNumber: "+9779800000006",
        requestedRole: "doctor",
        nmcNumber: nmc("BADEMAIL"),
      },
    });
    check("invalid email is rejected (400)", badEmail.status === 400, `got ${badEmail.status}`);

    const missingField = await call("POST", "/access-requests", {
      body: { email: email("hmissing"), requestedRole: "doctor", nmcNumber: nmc("MISSING") },
    });
    check("missing required fields is rejected (400)", missingField.status === 400, `got ${missingField.status}`);

    // ---- 10c. Laboratory is blocked until the password is changed -------
    console.log("\n10c. Approved laboratory is confined to change-password");
    const labApproveEmail = email("hlabguard");
    emails.push(labApproveEmail);
    const labGuardRequest = await call("POST", "/auth/access-requests", {
      body: {
        name: "E2E Guard Lab",
        email: labApproveEmail,
        address: "34 Guard Road, Pokhara",
        contactNumber: "+9779800000007",
        requestedRole: "lab",
        labRegistryNumber: labReg("GUARD"),
      },
    });
    const guardRow = await AccessRequest.findOne({ email: labApproveEmail });
    const sentBeforeGuard = sentMail.length;
    const labApprove = await call("PATCH", `/admin/access-requests/${guardRow.id}/approve`, {
      token: adminToken,
      body: { notes: "approved for guard test" },
    });
    check("admin approves the laboratory request", labApprove.status === 200, `got ${labApprove.status}`);

    const guardMail = sentMail.slice(sentBeforeGuard).find((m) => /approved/i.test(m.subject));
    const guardPassword = guardMail?.text?.match(/Temporary password:\s*(\S+)/)?.[1];
    check("laboratory approval email carries a temporary password", Boolean(guardPassword));

    const labLogin = await call("POST", "/auth/login", { body: { email: labApproveEmail, password: guardPassword } });
    check("laboratory can log in with the temporary password", labLogin.status === 200, `got ${labLogin.status}`);
    const labAuth = unwrap(labLogin.data);
    check("laboratory role is assigned by the backend", labAuth.user?.role === "lab", `got ${labAuth.user?.role}`);
    check("laboratory account is flagged mustChangePassword", labAuth.user?.mustChangePassword === true);

    const labBlocked = await call("GET", "/lab/dashboard", { token: labAuth.token });
    check("laboratory dashboard is blocked while holding a temp password", labBlocked.status === 403, `got ${labBlocked.status}`);
    check("the block uses the PASSWORD_CHANGE_REQUIRED code", (labBlocked.data?.code ?? labBlocked.data?.data?.code) === "PASSWORD_CHANGE_REQUIRED", JSON.stringify(labBlocked.data));

    const labChange = await call("PATCH", "/auth/change-password", {
      token: labAuth.token,
      body: { currentPassword: guardPassword, newPassword: "LabNewPass!456" },
    });
    check("laboratory can change the temporary password", labChange.status === 200, `got ${labChange.status}`);

    const labAfter = await call("GET", "/lab/dashboard", { token: labAuth.token });
    check("laboratory dashboard opens after the change", labAfter.status === 200, `got ${labAfter.status}`);
    check("the temporary password no longer works", (await call("POST", "/auth/login", { body: { email: labApproveEmail, password: guardPassword } })).status === 401);
    check("laboratory can log in with the new password", (await call("POST", "/auth/login", { body: { email: labApproveEmail, password: "LabNewPass!456" } })).status === 200);

    const labRow = await AccessRequest.findOne({ email: labEmail });
    const sentBeforeDecline = sentMail.length;
    const decline = await call("PATCH", `/admin/access-requests/${labRow.id}/reject`, {
      token: adminToken,
      body: { notes: "declined over http" },
    });
    check("admin declines the request", decline.status === 200, `got ${decline.status}`);
    check("no account was created on decline", (await User.countDocuments({ email: labEmail })) === 0);
    const declineMail = sentMail.slice(sentBeforeDecline).find((m) => /declined/i.test(m.subject));
    check("a decline email was sent", Boolean(declineMail));

    // ---- 11. Password recovery over HTTP --------------------------------
    console.log("\n11. Forgot password over HTTP");
    const forgot = await call("POST", "/auth/forgot-password", { body: { email: patientEmail } });
    check("forgot-password returns 200", forgot.status === 200, `got ${forgot.status}`);
    check("forgot-password does not leak a token in the response", forgot.data?.data?.token === undefined);

    const unknownForgot = await call("POST", "/auth/forgot-password", { body: { email: email("hnobody") } });
    check("unknown email returns the same 200 shape", unknownForgot.status === 200, `got ${unknownForgot.status}`);

    const badReset = await call("POST", "/auth/reset-password", { body: { token: "totally-invalid-token", password: "NewPassw0rd!1" } });
    check("invalid reset token is rejected", badReset.status === 400, `got ${badReset.status}`);

    // ---- 12. Change password requires auth --------------------------------
    console.log("\n12. Change password requires authentication");
    const noAuthChange = await call("PATCH", "/auth/change-password", { body: { currentPassword: "Passw0rd!Test", newPassword: "NewPassw0rd!1" } });
    check("change-password without token is 401", noAuthChange.status === 401, `got ${noAuthChange.status}`);

    const wrongCurrent = await call("PATCH", "/auth/change-password", {
      token: reAuth.token,
      body: { currentPassword: "definitely-wrong", newPassword: "NewPassw0rd!1" },
    });
    check("change-password with wrong current is 401", wrongCurrent.status === 401, `got ${wrongCurrent.status}`);

    // ---- 13. /auth/me ----------------------------------------------------
    console.log("\n13. Session bootstrap");
    const me = await call("GET", "/auth/me", { token: reAuth.token });
    check(
      "GET /auth/me returns the current user",
      me.status === 200 && String(unwrap(me.data).user?.email || "").toLowerCase() === applicantEmail.toLowerCase(),
      `got ${me.status}`
    );
    check("/auth/me never returns a token", unwrap(me.data).token === undefined);

    const meNoToken = await call("GET", "/auth/me");
    check("GET /auth/me without token is 401", meNoToken.status === 401, `got ${meNoToken.status}`);

    // ---- 14. Admin-created Patient with a temporary password over HTTP ----
    console.log("\n14. Admin-initiated Patient provisioning over HTTP");
    const createdEmail = email("hnew");
    const beforeMail = sentMail.length;

    const unauthCreate = await call("POST", "/admin/patients", {
      body: { name: "No Token", email: createdEmail },
    });
    check("POST /admin/patients without a token is 401", unauthCreate.status === 401, `got ${unauthCreate.status}`);

    const patientCreate = await call("POST", "/admin/patients", {
      token: reAuth.token,
      body: { name: "Not An Admin", email: createdEmail },
    });
    check("a Doctor cannot create a Patient account", patientCreate.status === 403, `got ${patientCreate.status}`);

    const patientToken = patientLogin.data?.token || unwrap(patientLogin.data).token;
    const patientSelfCreate = await call("POST", "/admin/patients", {
      token: patientToken,
      body: { name: "Self Provision", email: email("hself") },
    });
    check("a Patient cannot create a Patient account", patientSelfCreate.status === 403, `got ${patientSelfCreate.status}`);

    const created = await call("POST", "/admin/patients", {
      token: adminToken,
      body: { name: "HTTP Provisioned Patient", email: createdEmail, address: "Ward 7, HILMS", contactNumber: "+9779822222222" },
    });
    check("POST /admin/patients returns 201", created.status === 201, `got ${created.status} ${JSON.stringify(created.data)}`);
    check("the created account is a Patient", unwrap(created.data).user?.role === "patient");
    check("the created account must change its password", unwrap(created.data).user?.mustChangePassword === true);
    check(
      "the response never contains the temporary password",
      !JSON.stringify(created.data).toLowerCase().includes("temporarypassword")
    );

    const createdMail = sentMail[beforeMail];
    check("a temporary password email was sent", Boolean(createdMail));
    check("the subject matches the spec", createdMail?.subject === "HILMS - Your Temporary Login Password");
    const httpTemporaryPassword = (createdMail?.text || "").match(/Temporary Password:\s*(\S+)/)?.[1];
    check("the email carries a temporary password", Boolean(httpTemporaryPassword));

    const withSuppliedPassword = await call("POST", "/admin/patients", {
      token: adminToken,
      body: { name: "Bad Actor", email: email("hbadpw"), password: "AttackerChosen1" },
    });
    check("a client-supplied password is rejected", withSuppliedPassword.status === 400, `got ${withSuppliedPassword.status}`);

    const withWrongRole = await call("POST", "/admin/patients", {
      token: adminToken,
      body: { name: "Role Escalation", email: email("hrole"), role: "admin" },
    });
    check("a non-patient role is rejected", withWrongRole.status === 400, `got ${withWrongRole.status}`);

    const missingName = await call("POST", "/admin/patients", { token: adminToken, body: { email: email("hnoname") } });
    check("a missing name is rejected", missingName.status === 400, `got ${missingName.status}`);

    // Log in with the emailed temporary password and confirm the forced flow.
    const tempLogin = await call("POST", "/auth/login", {
      body: { email: createdEmail, password: httpTemporaryPassword },
    });
    check("the patient can log in with the temporary password", tempLogin.status === 200, `got ${tempLogin.status}`);
    check("login reports mustChangePassword", unwrap(tempLogin.data).user?.mustChangePassword === true);
    const tempToken = tempLogin.data?.token || unwrap(tempLogin.data).token;

    const adminWhileForced = await call("GET", "/admin/users", { token: tempToken });
    check("a forced-change patient still cannot reach Admin routes", adminWhileForced.status === 403, `got ${adminWhileForced.status}`);
    const labWhileForced = await call("GET", "/lab/requests", { token: tempToken });
    check("a forced-change patient cannot reach Lab routes", labWhileForced.status === 403, `got ${labWhileForced.status}`);

    const stillForced = await call("GET", "/auth/me", { token: tempToken });
    check("the session survives while the change is pending", stillForced.status === 200, `got ${stillForced.status}`);

    const badTemp = await call("PATCH", "/auth/change-password", {
      token: tempToken,
      body: { temporaryPassword: "WrongPassword!1", newPassword: "NewPatient!9", confirmPassword: "NewPatient!9" },
    });
    check("a wrong temporary password is rejected", badTemp.status === 401, `got ${badTemp.status}`);

    const badConfirm = await call("PATCH", "/auth/change-password", {
      token: tempToken,
      body: { temporaryPassword: httpTemporaryPassword, newPassword: "NewPatient!9", confirmPassword: "Mismatch!9" },
    });
    check("a mismatched confirmation is rejected", badConfirm.status === 400, `got ${badConfirm.status}`);

    const goodChange = await call("PATCH", "/auth/change-password", {
      token: tempToken,
      body: { temporaryPassword: httpTemporaryPassword, newPassword: "NewPatient!9", confirmPassword: "NewPatient!9" },
    });
    check("the change succeeds", goodChange.status === 200, `got ${goodChange.status} ${JSON.stringify(goodChange.data)}`);
    check("the response clears the flag", unwrap(goodChange.data).mustChangePassword === false);

    const oldLogin = await call("POST", "/auth/login", { body: { email: createdEmail, password: httpTemporaryPassword } });
    check("the temporary password no longer works", oldLogin.status === 401, `got ${oldLogin.status}`);
    const newLogin = await call("POST", "/auth/login", { body: { email: createdEmail, password: "NewPatient!9" } });
    check("the new password works", newLogin.status === 200, `got ${newLogin.status}`);
    check("the flag is cleared on the next login", unwrap(newLogin.data).user?.mustChangePassword === false);
  } finally {
    emailService.env.email.host = savedSmtpHost;
    emailService.setTransport(null);
    const users = await User.find({ email: { $in: emails } }).select("_id");
    const userIds = users.map((u) => u._id);
    await Promise.all([
      User.deleteMany({ email: { $in: emails } }),
      AccessRequest.deleteMany({ email: { $in: emails } }),
      PasswordResetToken.deleteMany({ user: { $in: userIds } }),
      Notification.deleteMany({ recipient: { $in: userIds } }),
      // Audit rows are keyed by email, not user id, so they need their own
      // delete - otherwise every run leaves test entries in the real trail.
      AuditLog.deleteMany({ targetEmail: { $in: emails } }),
    ]);
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  console.log(`\n${"=".repeat(52)}\n  ${passed} passed, ${failed} failed\n${"=".repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("\nHTTP E2E crashed:", error);
  process.exit(1);
});
