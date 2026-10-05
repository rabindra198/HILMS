const mongoose = require("mongoose");

const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const { toSafeObject } = require("../models/AccessRequest");
const {
  ROLES,
  ADMIN_APPROVAL_ROLES,
  getRoleLabel,
  resolveRequestableRole,
  resolveSelfRegistrableRole,
} = require("../config/roles");
const { userResource } = require("../resources/userResource");
const auditService = require("./audit.service");
const emailService = require("./email.service");
const notificationService = require("./notification.service");
const { generateTemporaryPassword } = require("./tempPassword.service");
const env = require("../config/env");
const { publishPatientRegistered } = require("../realtime/publish");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const objectId = (value, name = "id") => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    fail(`Valid ${name} is required`);
  }
  return value;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

// Notification writing lives in `notification.service` so the Admin alert raised
// here and the ones raised by bookings, billing and patient registration cannot
// drift apart. `notify` is the local shorthand for a single-recipient send.
const notify = (recipient, type, title, message, entityType, entityId) =>
  notificationService.notifyUser({ recipient, type, title, message, entityType, entityId });

/**
 * SRS 15 duplicate rules, shared by both public submission paths.
 *
 * - an existing active account  -> tell them to log in
 * - an existing PENDING request -> tell them it is already being reviewed
 */
const assertEmailAvailable = async (email, { allowPending = true } = {}) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    fail(
      existingUser.status === "APPROVED"
        ? "An account already exists for this email. Please login instead."
        : `An account already exists for this email with status ${existingUser.status}. Please contact the hospital administrator.`,
      409
    );
  }

  if (!allowPending) return;

  const openRequest = await AccessRequest.findOne({ email, status: "PENDING" });
  if (openRequest) {
    fail("A registration request for this email is already pending administrator approval.", 409);
  }
};

/**
 * SRS duplicate rule: a professional registration number belongs to exactly one
 * person or laboratory. Checked against live accounts and against requests that
 * are still under review, so the same number cannot be queued twice either.
 *
 * Only the field matching the requested role is considered, because a Doctor
 * request never carries a lab registry number and vice versa.
 */
const assertRegistrationNumberAvailable = async (
  requestedRole,
  { nmcNumber, labRegistryNumber, excludeRequestId } = {}
) => {
  const field = requestedRole === ROLES.DOCTOR ? "nmcNumber" : "labRegistryNumber";
  const value = requestedRole === ROLES.DOCTOR ? nmcNumber : labRegistryNumber;
  if (!value) return;

  const label = requestedRole === ROLES.DOCTOR ? "NMC number" : "Laboratory registry number";

  const accountHolder = await User.findOne({ [field]: value }).select("email role nmcNumber labRegistryNumber");
  if (accountHolder) {
    fail(
      `This ${label} is already registered to an existing account (${accountHolder.email}). If this is your own registration, please login instead.`,
      409
    );
  }

  // On approval the request being reviewed is itself PENDING, so it is excluded.
  const pendingHolder = await AccessRequest.findOne({
    [field]: value,
    status: "PENDING",
    ...(excludeRequestId ? { _id: { $ne: excludeRequestId } } : {}),
  });
  if (pendingHolder) {
    fail(`This ${label} already has a request awaiting administrator approval.`, 409);
  }
};

// ---------------------------------------------------------------------------
// Patient self-registration (SRS 2.6 / FR-AUTH-02)
// ---------------------------------------------------------------------------

/**
 * Creates an active Patient account immediately - no approval step.
 *
 * The role is forced to `patient` regardless of the request body, the account
 * starts APPROVED and active, and `mustChangePassword` is false because the
 * patient chose their own password.
 */
const registerPatient = async (payload = {}) => {
  const name = String(payload.name || "").trim();
  const email = normalizeEmail(payload.email);
  const address = String(payload.address || "").trim();
  const contactNumber = String(payload.contactNumber || "").trim();
  const password = String(payload.password || "");

  // Defence in depth: the validator already rejects a non-patient `role`, but
  // the service never trusts the body.
  if (payload.role && resolveSelfRegistrableRole(payload.role) === null) {
    fail("Only patients can self-register. Doctors and Laboratory staff must request access.", 403);
  }

  if (password.length < 6) {
    fail("Password must be at least 6 characters");
  }

  // `allowPending` stays on: a self-registered patient must not be able to claim
  // an address that a doctor/laboratory request is already holding, otherwise the
  // later approval would collide with (or re-role) this very account.
  await assertEmailAvailable(email);

  let user;
  try {
    user = await User.create({
      name,
      email,
      address,
      contactNumber,
      phone: contactNumber,
      password,
      role: ROLES.PATIENT,
      status: "APPROVED",
      isActive: true,
      mustChangePassword: false,
    });
  } catch (error) {
    // Lost a race against a concurrent registration with the same email.
    if (error?.code === 11000) {
      fail("An account already exists for this email. Please login instead.", 409);
    }
    throw error;
  }

  const { text, html } = emailService.buildPatientWelcomeEmail({
    name: user.name,
    email: user.email,
    loginUrl: `${env.appUrl}/login`,
  });
  const mail = await emailService.sendMail({
    to: user.email,
    subject: "Welcome to HILMS - your patient account is ready",
    text,
    html,
  });

  await auditService.record({
    action: "PATIENT_REGISTERED",
    actor: user,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { emailDelivered: mail.delivered },
  });

  publishPatientRegistered();
  return { user: userResource(user), emailDelivered: mail.delivered };
};

// ---------------------------------------------------------------------------
// Doctor / Laboratory access request (PENDING, no credentials)
// ---------------------------------------------------------------------------

/**
 * Public submission by a Doctor or Laboratory applicant.
 *
 * Stores a PENDING record only. No password is accepted, no account exists and
 * no token is issued until an Admin approves the request.
 */
const submitAccessRequest = async (payload = {}) => {
  const name = String(payload.name || "").trim();
  const email = normalizeEmail(payload.email);
  const address = String(payload.address || "").trim();
  const contactNumber = String(payload.contactNumber || "").trim();
  const nmcNumber = String(payload.nmcNumber || "").trim().toUpperCase();
  const labRegistryNumber = String(payload.labRegistryNumber || "").trim().toUpperCase();

  const requestedRole = resolveRequestableRole(payload.requestedRole);
  if (!requestedRole || !ADMIN_APPROVAL_ROLES.includes(requestedRole)) {
    fail(
      `Invalid requested role. Doctors and Laboratory staff must request access. Allowed roles: ${ADMIN_APPROVAL_ROLES.join(", ")}`
    );
  }

  // A password must never reach this endpoint.
  if (String(payload.password || "").trim()) {
    fail(
      "Doctors and Laboratory staff cannot choose a password. An administrator issues a temporary one on approval."
    );
  }

  // Only the role-specific identity field is persisted for the chosen role.
  if (requestedRole === ROLES.DOCTOR && !nmcNumber) {
    fail("NMC number is required for doctor registration");
  }
  if (requestedRole === ROLES.LAB && !labRegistryNumber) {
    fail("Laboratory registry number is required for laboratory registration");
  }
  if (requestedRole === ROLES.DOCTOR && labRegistryNumber) {
    fail("Laboratory registry number is not applicable to doctor registration");
  }
  if (requestedRole === ROLES.LAB && nmcNumber) {
    fail("NMC number is not applicable to laboratory registration");
  }

  await assertEmailAvailable(email);
  await assertRegistrationNumberAvailable(requestedRole, { nmcNumber, labRegistryNumber });

  const created = await AccessRequest.create({
    name,
    email,
    address,
    contactNumber,
    requestedRole,
    // Whichever is undefined here is simply not written to the document.
    ...(requestedRole === ROLES.DOCTOR ? { nmcNumber } : { labRegistryNumber }),
    status: "PENDING",
  });

  // Tell the Admin portal there is something waiting, so a pending request is
  // not invisible until an Admin happens to open this page. Best-effort: a
  // failed notification must not lose the request itself.
  const notifiedAdmins = await notificationService.notifyAdmins({
    type: "ACCESS_REQUEST_SUBMITTED",
    title: "New access request",
    message: `${name} requested ${getRoleLabel(requestedRole)} access and is awaiting review.`,
    entityType: "AccessRequest",
    entityId: created._id,
    preference: "accessRequestAlerts",
  });

  await auditService.record({
    action: "ACCESS_REQUEST_SUBMITTED",
    targetType: "AccessRequest",
    targetId: created._id,
    targetEmail: email,
    metadata: { requestedRole, notifiedAdmins },
  });

  return toSafeObject(created);
};

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------

const listFilter = ({ status, role, search } = {}) => {
  const filter = {};
  if (status) filter.status = String(status).trim().toUpperCase();
  if (role) filter.requestedRole = resolveRequestableRole(role) || String(role).trim().toLowerCase();
  if (search) {
    const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: new RegExp(safe, "i") },
      { email: new RegExp(safe, "i") },
      { contactNumber: new RegExp(safe, "i") },
      { nmcNumber: new RegExp(safe, "i") },
      { labRegistryNumber: new RegExp(safe, "i") },
    ];
  }
  return filter;
};

/**
 * Counts per status, always spanning all three statuses.
 *
 * The incoming `filter` may already carry a `status` (the Admin dashboard
 * defaults to the PENDING tab). That is dropped here, because a per-status
 * breakdown that silently collapsed to the active tab would report zero for
 * every other status. `total` is the sum of the three, so the parts can never
 * disagree with the whole. Search and role filters still apply.
 */
const countByStatus = async (filter) => {
  const { status: _ignoredStatus, ...scoped } = filter;
  const [pending, approved, rejected] = await Promise.all([
    AccessRequest.countDocuments({ ...scoped, status: "PENDING" }),
    AccessRequest.countDocuments({ ...scoped, status: "APPROVED" }),
    AccessRequest.countDocuments({ ...scoped, status: "REJECTED" }),
  ]);
  return { pending, approved, rejected, total: pending + approved + rejected };
};

const getAccessRequests = async (filters = {}) => {
  const filter = listFilter(filters);
  const [requests, counts] = await Promise.all([
    AccessRequest.find(filter).sort({ createdAt: -1 }).lean(),
    countByStatus(filter),
  ]);
  return { requests: requests.map((request) => toSafeObject(request)), counts };
};

const getAccessRequest = async (requestId) => {
  objectId(requestId, "access request id");
  const request = await AccessRequest.findById(requestId);
  if (!request) fail("Access request not found", 404);
  return toSafeObject(request);
};

/**
 * Approves a Doctor / Laboratory request and creates the account.
 *
 * The applicant never chose a password, so approval generates a secure
 * one-time temporary password here. The plaintext is emailed (SMTP) and never
 * persisted - only its bcrypt hash reaches the database. The account is flagged
 * `mustChangePassword`, which confines the session to the change-password
 * endpoint until the credential is replaced.
 *
 * Never adopts an existing account: re-using a live identity would let a staff
 * request silently re-role a real user (e.g. convert a self-registered patient
 * into a doctor). A genuine conflict fails loudly with 409 instead, and a failed
 * review write rolls the new account back so it can never be orphaned.
 */
const approveAccessRequest = async (requestId, adminUser, options = {}) => {
  objectId(requestId, "access request id");
  const reviewNotes = String(options.notes || "").trim();

  const request = await AccessRequest.findById(requestId);
  if (!request) fail("Access request not found", 404);
  if (request.status !== "PENDING") {
    fail(`This request has already been ${request.status.toLowerCase()}`, 409);
  }

  // Re-validate the stored role server-side: it is untrusted input.
  const assignedRole = resolveRequestableRole(request.requestedRole);
  if (!assignedRole || !ADMIN_APPROVAL_ROLES.includes(assignedRole)) {
    fail(`Stored requested role "${request.requestedRole}" is not approvable`, 422);
  }

  // Generated fresh on every approval so a re-issued credential is never a
  // repeat of one already sent out.
  const temporaryPassword = generateTemporaryPassword();

  const existingUser = await User.findOne({ email: request.email });
  if (existingUser) {
    // Submissions already reject emails held by a live account, so reaching this
    // branch means the address was claimed after the request was filed. Fail
    // loudly rather than re-role somebody's real account.
    fail(
      `An account already exists for ${request.email}. Refusing to reassign it to the ${getRoleLabel(
        assignedRole
      )} role - resolve the email conflict before approving.`,
      409
    );
  }

  // Re-check the registration number at approval time too: an account may have
  // been created for it between submission and review. The request stays PENDING
  // so an Admin can resolve the clash rather than silently issuing a duplicate.
  await assertRegistrationNumberAvailable(assignedRole, {
    nmcNumber: request.nmcNumber,
    labRegistryNumber: request.labRegistryNumber,
    excludeRequestId: request._id,
  });

  const user = await User.create({
    name: request.name,
    email: request.email,
    address: request.address,
    contactNumber: request.contactNumber,
    phone: request.contactNumber,
    password: temporaryPassword,
    role: assignedRole,
    status: "APPROVED",
    isActive: true,
    mustChangePassword: true,
    temporaryPasswordIssuedAt: new Date(),
    ...(assignedRole === ROLES.DOCTOR
      ? { nmcNumber: request.nmcNumber }
      : { labRegistryNumber: request.labRegistryNumber }),
  });

  try {
    request.status = "APPROVED";
    request.reviewedBy = adminUser._id;
    request.reviewedAt = new Date();
    request.reviewNotes = reviewNotes;
    request.user = user._id;
    request.userCreatedOnApproval = true;
    await request.save();
  } catch (error) {
    // Roll the new account back so a failed review cannot strand an active
    // user holding a credential that was never delivered by email.
    await User.deleteOne({ _id: user._id }).catch((cleanupError) => {
      console.error("[ACCESS_REQUEST] Failed to roll back account after review error:", cleanupError.message);
    });
    throw error;
  }

  // The only place the plaintext temporary password is ever rendered.
  const roleLabel = getRoleLabel(assignedRole);
  const { text, html } = emailService.buildAccountApprovedEmail({
    name: user.name,
    email: user.email,
    roleLabel,
    temporaryPassword,
    loginUrl: `${env.appUrl}/login`,
  });
  const mail = await emailService.sendMail({
    to: user.email,
    subject: "Your HILMS access request has been approved - your temporary password",
    text,
    html,
  });

  // An undelivered temporary password means the account is unusable: the
  // applicant never chose a password, so without this email they can never log
  // in. Both the new account and the review write are rolled back, leaving the
  // request PENDING so the review can be retried once SMTP recovers.
  if (!mail.delivered) {
    await User.deleteOne({ _id: user._id }).catch((cleanupError) => {
      console.error("[ACCESS_REQUEST] Failed to roll back account after mail failure:", cleanupError.message);
    });
    request.status = "PENDING";
    request.reviewedBy = undefined;
    request.reviewedAt = undefined;
    request.reviewNotes = undefined;
    request.user = undefined;
    request.userCreatedOnApproval = false;
    await request.save().catch((cleanupError) => {
      console.error("[ACCESS_REQUEST] Failed to restore request after mail failure:", cleanupError.message);
    });
    await auditService.record({
      action: "ACCESS_REQUEST_APPROVAL_ROLLED_BACK",
      actor: adminUser,
      targetType: "AccessRequest",
      targetId: request._id,
      targetEmail: request.email,
      metadata: { reason: mail.reason || "email_not_delivered" },
    });
    fail(
      "Approval could not be completed because the temporary password email could not be sent. The request remains pending - please try again.",
      502
    );
  }

  // Sent only once the credential is known to have reached the applicant, so a
  // rolled-back approval never leaves a notification pointing at a dead account.
  await notify(
    user._id,
    "ACCESS_REQUEST_APPROVED",
    "Access request approved",
    `Your HILMS account has been approved with the ${roleLabel} role. A temporary password has been emailed to you - you must change it when you first sign in.`,
    "AccessRequest",
    request._id
  );

  await auditService.record({
    action: "ACCESS_REQUEST_APPROVED",
    actor: adminUser,
    targetType: "AccessRequest",
    targetId: request._id,
    targetEmail: request.email,
    metadata: {
      assignedRole,
      userId: user._id.toString(),
      userCreatedOnApproval: true,
      reviewNotes,
      temporaryPasswordIssued: true,
      emailDelivered: mail.delivered,
    },
  });

  // The temporary password is intentionally NOT included in the response.
  return {
    request: toSafeObject(request),
    user: userResource(user),
    emailDelivered: mail.delivered,
  };
};

const rejectAccessRequest = async (requestId, adminUser, options = {}) => {
  objectId(requestId, "access request id");
  const reviewNotes = String(options.notes || "").trim();

  const request = await AccessRequest.findById(requestId);
  if (!request) fail("Access request not found", 404);
  if (request.status !== "PENDING") {
    fail(`This request has already been ${request.status.toLowerCase()}`, 409);
  }

  request.status = "REJECTED";
  request.reviewedBy = adminUser._id;
  request.reviewedAt = new Date();
  request.reviewNotes = reviewNotes;
  // The reason is stored on the record itself so the retained history explains
  // why the request was declined.
  request.rejectionReason = reviewNotes;
  await request.save();

  // No account was ever created for a pending request, so there is nothing to
  // deactivate. The request record is preserved for audit purposes.
  const roleLabel = getRoleLabel(request.requestedRole);
  const { text, html } = emailService.buildAccountRejectedEmail({
    name: request.name,
    email: request.email,
    roleLabel,
  });
  const mail = await emailService.sendMail({
    to: request.email,
    subject: "Your HILMS access request has been declined",
    text,
    html,
  });

  await auditService.record({
    action: "ACCESS_REQUEST_REJECTED",
    actor: adminUser,
    targetType: "AccessRequest",
    targetId: request._id,
    targetEmail: request.email,
    metadata: { requestedRole: request.requestedRole, reviewNotes, emailDelivered: mail.delivered },
  });

  return { request: toSafeObject(request), emailDelivered: mail.delivered };
};

/**
 * Unfiltered request counts, plus the existing user totals.
 *
 * Deliberately ignores any list filter: the dashboard cards must show the real
 * totals, not the number of rows that happen to match the current status tab.
 */
const getSummary = async () => {
  const [totalUsers, byRole, requestsByStatus] = await Promise.all([
    User.countDocuments(),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    AccessRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const tally = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const entry of requestsByStatus) {
    if (entry._id in tally) tally[entry._id] = entry.count;
  }

  return {
    totalUsers,
    pendingRequests: tally.PENDING,
    requestsByStatus: { ...tally, total: tally.PENDING + tally.APPROVED + tally.REJECTED },
    usersByRole: byRole.reduce((acc, entry) => ({ ...acc, [entry._id || ROLES.PATIENT]: entry.count }), {}),
  };
};

module.exports = {
  registerPatient,
  submitAccessRequest,
  getAccessRequests,
  getAccessRequest,
  approveAccessRequest,
  rejectAccessRequest,
  getSummary,
  listFilter,
};
