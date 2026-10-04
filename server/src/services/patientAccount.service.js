const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const { ROLES } = require("../config/roles");
const env = require("../config/env");
const auditService = require("./audit.service");
const emailService = require("./email.service");
const { generateTemporaryPassword } = require("./tempPassword.service");
const { userResource } = require("../resources/userResource");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

/**
 * Admin-initiated Patient account creation.
 *
 * The counterpart to the two existing account-provisioning paths:
 *   - Patient self-registration (public, user picks their own password)
 *   - Doctor / Laboratory approval (Admin approves, backend issues a password)
 *
 * When a receptionist, hospital admin, or an upstream system creates a Patient
 * record, this provisions the account with a backend-generated one-time
 * temporary password delivered over SMTP.
 *
 * Deliberately reused rather than reinvented:
 *  - `tempPassword.service` - the CSPRNG credential. The User model's pre-save
 *    hook bcrypt-hashes it, so plaintext is never persisted.
 *  - `email.service` - SMTP delivery, so there is exactly one mail system.
 *  - `audit.service` - the auditable trail (SRS 13).
 *
 * The role is always forced to Patient and is never read from the request body.
 */
const createPatientAccount = async (payload = {}, adminUser) => {
  const { name, email, address, contactNumber, phone } = payload;

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedContact = String(contactNumber || phone || "").trim();

  // Identity collision check, mirroring what the public Patient registration
  // already enforces, so one person can never end up with two identities.
  const [existingUser, openRequest] = await Promise.all([
    User.findOne({ email: normalizedEmail }),
    AccessRequest.findOne({ email: normalizedEmail, status: "PENDING" }),
  ]);
  if (existingUser) {
    fail("An account already exists for this email address", 409);
  }
  if (openRequest) {
    fail("A pending access request already exists for this email address", 409);
  }

  // Generated fresh on every creation, so a re-issued credential is never a
  // repeat of one that has already been sent out.
  const temporaryPassword = generateTemporaryPassword();

  const user = await User.create({
    name,
    email: normalizedEmail,
    address,
    contactNumber: normalizedContact,
    phone: normalizedContact,
    password: temporaryPassword,
    role: ROLES.PATIENT,
    status: "APPROVED",
    isActive: true,
    // Confined to the change-password screen until the credential is replaced.
    // Enforced server-side by blockUntilPasswordChanged, not by the frontend.
    mustChangePassword: true,
    temporaryPasswordIssuedAt: new Date(),
  });

  // The only place the plaintext temporary password is ever rendered.
  const { text, html } = emailService.buildPatientTemporaryPasswordEmail({
    name: user.name,
    email: user.email,
    temporaryPassword,
    loginUrl: `${env.appUrl}/login`,
  });
  const mail = await emailService.sendMail({
    to: user.email,
    subject: "HILMS - Your Temporary Login Password",
    text,
    html,
  });

  // Never leave an unusable account behind. Without a delivered temporary
  // password the Patient could never log in, so the account is removed rather
  // than persisted in a state they cannot escape.
  if (!mail.delivered) {
    await User.deleteOne({ _id: user._id }).catch((cleanupError) => {
      console.error("[PATIENT_CREATE] Failed to roll back account after mail failure:", cleanupError.message);
    });
    await auditService.record({
      action: "PATIENT_ACCOUNT_CREATE_ROLLED_BACK",
      actor: adminUser,
      targetType: "User",
      targetId: user._id,
      targetEmail: user.email,
      metadata: { reason: mail.reason || "email_not_delivered" },
    });
    fail(
      "Patient account could not be completed because the temporary password email could not be sent. Please try again.",
      502
    );
  }

  await auditService.record({
    action: "PATIENT_ACCOUNT_CREATED",
    actor: adminUser,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { assignedRole: ROLES.PATIENT, temporaryPasswordIssued: true, emailDelivered: mail.delivered },
  });

  // The temporary password is intentionally NOT included in the response.
  return { user: userResource(user), emailDelivered: mail.delivered };
};

module.exports = { createPatientAccount };
