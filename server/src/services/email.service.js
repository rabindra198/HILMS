const nodemailer = require("nodemailer");
const env = require("../config/env");

/**
 * Outbound transactional email over SMTP.
 *
 * SRS 5.3 - "Email shall be sent through a configured SMTP provider."
 * The transporter is built lazily and cached, so requiring this module never
 * opens a socket and the server still boots with placeholder SMTP values.
 *
 * `sendMail` never throws - it resolves with a delivery result so callers can
 * react explicitly. Account-provisioning callers treat an undelivered
 * temporary password as a hard failure and roll the account back, so nobody
 * is left holding an account whose credential never reached them.
 */

let cachedTransport = null;

const isEmailConfigured = () => Boolean(env.email.host && env.email.from);

const isProduction = () => process.env.NODE_ENV === "production";

const getTransport = () => {
  if (cachedTransport) return cachedTransport;

  const options = {
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
  };

  // Only send AUTH when credentials were supplied - some local relays
  // (MailHog, smtp4dev) deliberately run without authentication.
  if (env.email.user) {
    options.auth = { user: env.email.user, pass: env.email.password };
  }

  cachedTransport = nodemailer.createTransport(options);
  return cachedTransport;
};

/** Test seam: lets the suite inject a fake transport instead of a real socket. */
const setTransport = (transport) => {
  cachedTransport = transport;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const shell = (inner) => `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#eef6f2;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 4px;font-size:20px;color:#123b52;">HILMS</h1>
        <p style="margin:0 0 24px;font-size:13px;color:#5b6b6a;">Hospital Information &amp; Lab Management System</p>
        ${inner}
      </td></tr>
    </table>
  </body>
</html>`;

const button = (url, label) =>
  `<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#f26a50;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:999px;">${escapeHtml(label)}</a></p>`;

/**
 * Renders the password-reset email. Kept separate so the markup is testable
 * and the token only ever appears in this single place.
 */
const buildPasswordResetEmail = ({ name, email, resetUrl, ttlMinutes }) => {
  const safeName = escapeHtml(name || "there");
  const safeUrl = escapeHtml(resetUrl);

  const text = [
    `Hello ${name || "there"},`,
    "",
    "A password reset was requested for your HILMS account.",
    "",
    `Open this link to choose a new password (valid for ${ttlMinutes} minutes):`,
    resetUrl,
    "",
    "If you did not request this, you can safely ignore this email - your",
    "password will not change until the link above is used.",
    "",
    `If the link does not work, contact ${env.email.supportEmail}.`,
  ].join("\n");

  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;">Reset your password</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${safeName},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      A password reset was requested for your HILMS account. Use the button below to choose a new password.
      This link expires in ${ttlMinutes} minutes.
    </p>
    ${button(resetUrl, "Reset Password")}
    <p style="margin:0 0 8px;font-size:12px;color:#5b6b6a;">If the button does not work, paste this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#168d79;">${safeUrl}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#5b6b6a;">
      If you did not request this, you can safely ignore this email - your password will not change
      until the link above is used.
    </p>`);

  return { text, html };
};

/**
 * Sent when an Admin approves a Doctor / Laboratory request. This is the ONLY
 * place the plaintext temporary password is ever rendered - the database only
 * ever stores its bcrypt hash.
 */
const buildAccountApprovedEmail = ({ name, email, roleLabel, temporaryPassword, loginUrl, directProvision = false }) => {
  const safeName = escapeHtml(name || "there");
  const safePassword = escapeHtml(temporaryPassword || "");
  const safeUrl = escapeHtml(loginUrl);
  const heading = directProvision ? "Your HILMS account is ready" : "Access request approved";
  const accountMessage = directProvision
    ? `An administrator created your HILMS account with the ${roleLabel} role.`
    : `Your HILMS access request has been approved with the ${roleLabel} role.`;

  const text = [
    `Hello ${name || "there"},`,
    "",
    accountMessage,
    "",
    `Sign in with: ${email}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "You must change this password the first time you sign in.",
    "",
    `Sign in: ${loginUrl}`,
  ].join("\n");

  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;">${heading}</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      ${directProvision ? "An administrator created your HILMS account with" : "Your access request has been approved with the"} <strong>${escapeHtml(roleLabel)}</strong> role.
      Use the temporary password below to sign in.
    </p>
    <p style="margin:0 0 4px;font-size:12px;color:#5b6b6a;">Sign in with</p>
    <p style="margin:0 0 16px;font-size:15px;word-break:break-all;">${escapeHtml(email)}</p>
    <p style="margin:0 0 4px;font-size:12px;color:#5b6b6a;">Temporary password</p>
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;letter-spacing:0.5px;background:#e7f4ee;border-radius:12px;padding:12px 16px;word-break:break-all;">${safePassword}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;">
      You will be required to change this password the first time you sign in.
      For your security, do not share or forward this email.
    </p>
    ${button(loginUrl, "Sign In")}
    <p style="margin:0;font-size:12px;line-height:1.6;color:#5b6b6a;">
      If you did not expect this, contact ${escapeHtml(env.email.supportEmail)} immediately.
    </p>`);

  return { text, html };
};

/** Sent when an Admin declines a Doctor / Laboratory request. */
const buildAccountRejectedEmail = ({ name, email, roleLabel, loginUrl }) => {
  const text = [
    `Hello ${name || "there"},`,
    "",
    `Your HILMS ${roleLabel} access request has been declined.`,
    "",
    "No account was created and you will not be able to sign in with this",
    "email address. You are welcome to submit a new request later if your",
    "credentials change.",
    "",
    `For more information contact ${env.email.supportEmail}.`,
  ].join("\n");

  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;">Access request declined</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${escapeHtml(name || "there")},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your HILMS <strong>${escapeHtml(roleLabel)}</strong> access request has been declined.
      No account was created for ${escapeHtml(email)}.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      You are welcome to submit a new request later if your credentials change.
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#5b6b6a;">
      For more information contact ${escapeHtml(env.email.supportEmail)}.
    </p>`);

  return { text, html };
};

/**
 * Sent when the system or an Admin provisions a Patient account with a
 * temporary password. Like `buildAccountApprovedEmail`, this is the only place
 * the plaintext credential is ever rendered - the database only ever holds its
 * bcrypt hash. Subject is set by the caller ("HILMS - Your Temporary Login
 * Password").
 */
const buildPatientTemporaryPasswordEmail = ({ name, email, temporaryPassword, loginUrl }) => {
  const safeName = escapeHtml(name || "there");
  const safePassword = escapeHtml(temporaryPassword || "");
  const safeUrl = escapeHtml(loginUrl);

  const text = [
    `Dear ${name || "Patient"},`,
    "",
    "Your HILMS account has been created successfully.",
    "",
    `Login Email: ${email}`,
    `Temporary Password: ${temporaryPassword}`,
    "",
    "Please log in using these credentials.",
    "",
    "For security, you will be required to change this temporary password",
    "immediately after your first successful login.",
    "",
    "Do not share your password with anyone.",
    "",
    `Sign in: ${loginUrl}`,
    "",
    "Regards,",
    "HILMS Team",
  ].join("\n");

  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;">Welcome to HILMS</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Dear ${safeName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Your HILMS account has been created successfully.
    </p>
    <p style="margin:0 0 4px;font-size:12px;color:#5b6b6a;">Login Email</p>
    <p style="margin:0 0 16px;font-size:15px;word-break:break-all;">${escapeHtml(email)}</p>
    <p style="margin:0 0 4px;font-size:12px;color:#5b6b6a;">Temporary Password</p>
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;letter-spacing:0.5px;background:#e7f4ee;border-radius:12px;padding:12px 16px;word-break:break-all;">${safePassword}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Please log in using these credentials.</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      For security, you will be required to change this temporary password
      <strong>immediately after your first successful login</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#c0392b;">
      Do not share your password with anyone.
    </p>
    ${button(loginUrl, "Sign In")}
    <p style="margin:0;font-size:12px;line-height:1.6;color:#5b6b6a;">
      If you did not expect this, contact ${escapeHtml(env.email.supportEmail)} immediately.
    </p>`);

  return { text, html };
};

/** Sent after a Patient self-registration creates an active account. */
const buildPatientWelcomeEmail = ({ name, email, loginUrl }) => {
  const text = [
    `Hello ${name || "there"},`,
    "",
    "Your HILMS patient account has been created and is ready to use.",
    `You can sign in with ${email} using the password you chose.`,
    "",
    `Sign in: ${loginUrl}`,
  ].join("\n");

  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;">Welcome to HILMS</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${escapeHtml(name || "there")},</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Your patient account has been created and is ready to use. Sign in with
      <strong>${escapeHtml(email)}</strong> and the password you chose.
    </p>
    ${button(loginUrl, "Sign In")}`);

  return { text, html };
};

/**
 * Sent when a laboratory report is verified and released. The in-app
 * Notification is written inside the verification transaction; this email is
 * dispatched afterwards and can never affect that transaction.
 */
const buildLabReportReadyEmail = ({ name, reportId, testName, loginUrl }) => {
  const safeName = escapeHtml(name || "there");
  const safeReportId = escapeHtml(reportId || "");
  const safeTest = escapeHtml(testName || "Laboratory test");

  const text = [
    `Dear ${name || "there"},`,
    "",
    `Your laboratory report ${reportId} for ${testName} has been verified`,
    "by the laboratory and is now available in HILMS.",
    "",
    "Please sign in to view the full report.",
    "",
    `Sign in: ${loginUrl}`,
    "",
    "Regards,",
    "HILMS Team",
  ].join("\n");

  const html = shell(`
    <h2 style="margin:0 0 12px;font-size:18px;">Laboratory report ready</h2>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Dear ${safeName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Your laboratory report has been verified and released.
    </p>
    <p style="margin:0 0 4px;font-size:12px;color:#5b6b6a;">Test</p>
    <p style="margin:0 0 16px;font-size:15px;">${safeTest}</p>
    <p style="margin:0 0 4px;font-size:12px;color:#5b6b6a;">Report ID</p>
    <p style="margin:0 0 20px;font-size:18px;font-weight:700;letter-spacing:0.5px;">${safeReportId}</p>
    ${button(loginUrl, "View Report")}
    <p style="margin:0;font-size:12px;line-height:1.6;color:#5b6b6a;">
      If you did not expect this report, contact ${escapeHtml(env.email.supportEmail)}.
    </p>`);

  return { text, html };
};

/**
 * Sends an email over SMTP. Never throws.
 * @returns {Promise<{delivered: boolean, provider: string, id?: string, reason?: string}>}
 */
const sendMail = async ({ to, subject, text, html }) => {
  if (!isEmailConfigured()) {
    const reason = "SMTP is not configured (set SMTP_HOST and SMTP_FROM)";
    console.warn(`[EMAIL] Skipping "${subject}" to ${to}: ${reason}`);
    return { delivered: false, provider: env.email.provider, reason };
  }

  try {
    const result = await getTransport().sendMail({
      from: env.email.from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[EMAIL] Sent "${subject}" to ${to} (id: ${result?.messageId || "unknown"})`);
    return { delivered: true, provider: env.email.provider, id: result?.messageId };
  } catch (error) {
    // Never surface provider internals to the caller; log and degrade.
    console.error(`[EMAIL] Failed to send "${subject}" to ${to}:`, error.message);
    return { delivered: false, provider: env.email.provider, reason: "provider_error" };
  }
};

module.exports = {
  sendMail,
  isEmailConfigured,
  isProduction,
  env,
  setTransport,
  buildPasswordResetEmail,
  buildAccountApprovedEmail,
  buildAccountRejectedEmail,
  buildPatientTemporaryPasswordEmail,
  buildPatientWelcomeEmail,
  buildLabReportReadyEmail,
};
