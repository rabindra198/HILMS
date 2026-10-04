require("dotenv").config();

const required = ["MONGO_URI", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  // FR-AUTH-10 / NFR-04: temporary account lockout after repeated failed logins.
  // Both values are configurable so the policy can be tightened or relaxed per
  // deployment without a code change.
  security: {
    maxLoginAttempts: Math.max(1, Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5", 10) || 5),
    lockoutMinutes: Math.max(0, Number.parseFloat(process.env.LOGIN_LOCKOUT_MINUTES || "15") || 15),
    // FR-AUTH-08: how long a "remember me" session lasts (server token + cookie).
    rememberMeDays: Math.max(1, Number.parseInt(process.env.REMEMBER_ME_DAYS || "30", 10) || 30),
    // FR-AUTH-09: how long a sign-in history record is retained.
    loginHistoryTtlDays: Math.max(1, Number.parseInt(process.env.LOGIN_HISTORY_TTL_DAYS || "90", 10) || 90),
  },
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  // Where password-reset links point. Falls back to the client origin.
  appUrl: (process.env.APP_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, ""),
  // SRS 5.3: "Email shall be sent through a configured SMTP provider."
  // The transport is created lazily by services/email.service.js so the
  // process still boots with placeholder/empty SMTP values in development.
  email: {
    provider: process.env.EMAIL_PROVIDER || "smtp",
    host: process.env.SMTP_HOST || "",
    port: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    // Implicit TLS on 465, STARTTLS everywhere else. Can be forced with
    // SMTP_SECURE=true/false for relays that need the opposite behaviour.
    secure:
      String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" ||
      Number.parseInt(process.env.SMTP_PORT || "587", 10) === 465,
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "HILMS <no-reply@hilms.local>",
    supportEmail: process.env.SUPPORT_EMAIL || "support@hilms.local",
  },
  // SRS 5.4: online payment through a configured gateway. eSewa ePay replaced
  // Khalti; Khalti's credentials are no longer read by this server.
  //
  // The secret key is server-side only and must never be returned by an endpoint
  // or bundled into the React app. `configured` is what the payment service checks
  // before offering "Pay with eSewa", so an unconfigured deployment shows no
  // online option instead of a button that cannot work.
  esewa: {
    environment: (process.env.ESEWA_ENVIRONMENT || "uat").toLowerCase(),
    productCode: process.env.ESEWA_PRODUCT_CODE || "",
    secretKey: process.env.ESEWA_SECRET_KEY || "",
    successUrl: process.env.ESEWA_SUCCESS_URL || "",
    failureUrl: process.env.ESEWA_FAILURE_URL || "",
    // Endpoint overrides. eSewa publishes a UAT and a production host per
    // operation and provisions merchants against a specific one, so both form
    // and status-check URLs can be pinned without a code change.
    formUrl: process.env.ESEWA_FORM_URL || "",
    statusCheckUrl: process.env.ESEWA_STATUS_CHECK_URL || "",
  },
};
