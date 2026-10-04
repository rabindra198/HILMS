/**
 * Verifies the email service without contacting a real SMTP server by
 * injecting a fake nodemailer transport. Confirms the request shape, the
 * graceful-unconfigured path, HTML escaping, that provider errors are
 * swallowed rather than thrown, and - critically - that the approval email is
 * the only place a temporary password is ever rendered.
 */
require("dotenv").config();

const emailService = require("../services/email.service");
const { env } = emailService;

let passed = 0;
let failed = 0;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

// Captures whatever the service hands to the SMTP transport.
let captured = null;
const fakeTransport = (behaviour = "ok") => ({
  sendMail: async (payload) => {
    captured = payload;
    if (behaviour === "throw") throw new Error("ECONNREFUSED 10.0.0.1:587");
    return { messageId: "smtp-msg-123" };
  },
});

const run = async () => {
  const saved = {
    host: env.email.host,
    from: env.email.from,
    user: env.email.user,
    password: env.email.password,
  };

  // ---- 1. Unconfigured provider degrades gracefully --------------------
  console.log("\n1. Unconfigured provider");
  env.email.host = "";
  emailService.setTransport(null);
  check("isEmailConfigured() is false without a host", emailService.isEmailConfigured() === false);
  const unconfigured = await emailService.sendMail({ to: "a@b.io", subject: "s", text: "t" });
  check("sendMail resolves instead of throwing", unconfigured && typeof unconfigured === "object");
  check("sendMail reports delivered=false", unconfigured.delivered === false);
  check("sendMail explains the missing SMTP host", String(unconfigured.reason || "").includes("SMTP_HOST"));

  // ---- 2. Configured provider builds the right request ----------------
  console.log("\n2. Configured provider request shape");
  env.email.host = "smtp.example.com";
  env.email.from = "HILMS <no-reply@example.com>";
  env.email.user = "smtp-user";
  env.email.password = "smtp-pass";
  emailService.setTransport(fakeTransport("ok"));
  check("isEmailConfigured() is true with a host", emailService.isEmailConfigured() === true);

  const { text, html } = emailService.buildPasswordResetEmail({
    name: "Ada Lovelace",
    email: "ada@example.com",
    resetUrl: "https://app.hilms.test/reset-password?token=abc123",
    ttlMinutes: 30,
  });
  const sent = await emailService.sendMail({ to: "ada@example.com", subject: "Reset your HILMS password", text, html });

  check("sendMail reports delivered=true", sent.delivered === true, JSON.stringify(sent));
  check("sends the configured From address", captured.from === env.email.from);
  check("addresses the recipient", captured.to === "ada@example.com");
  check("body carries the subject", captured.subject === "Reset your HILMS password");
  check("body carries html + text", Boolean(captured.html) && Boolean(captured.text));
  check("html contains the reset link", captured.html.includes("https://app.hilms.test/reset-password?token=abc123"));
  check("text contains the reset link", captured.text.includes("https://app.hilms.test/reset-password?token=abc123"));
  check("text mentions the recipient name", captured.text.includes("Ada Lovelace"));
  check("text warns about unrequested resets", /did not request this/i.test(captured.text));

  // ---- 3. HTML escaping ------------------------------------------------
  console.log("\n3. HTML escaping");
  const escaped = emailService.buildPasswordResetEmail({
    name: '<img src=x onerror="alert(1)">',
    email: "x@y.io",
    resetUrl: 'https://app.hilms.test/reset-password?token=a&b="><script>alert(1)</script>',
    ttlMinutes: 30,
  });
  check("name is html-escaped", !escaped.html.includes("<img src=x"));
  check("injected script tag is escaped", !escaped.html.includes("<script>alert(1)"));
  check("quote-breakout is escaped", escaped.html.includes("&quot;"));
  check("ampersand in the url is escaped", escaped.html.includes("&amp;b="));

  // ---- 4. Provider errors are swallowed -------------------------------
  console.log("\n4. Provider failure handling");
  emailService.setTransport(fakeTransport("throw"));
  const failed1 = await emailService.sendMail({ to: "ada@example.com", subject: "s", text: "t" });
  check("transport error does not throw", failed1 && failed1.delivered === false);
  check("reason is generic (no provider internals leaked)", failed1.reason === "provider_error");

  // ---- 5. Approval email carries the temporary password ----------------
  console.log("\n5. Approval email (temporary password delivery)");
  emailService.setTransport(fakeTransport("ok"));
  const approval = emailService.buildAccountApprovedEmail({
    name: "Grace Hopper",
    email: "grace@example.com",
    roleLabel: "Doctor",
    temporaryPassword: "Temp!Passw0rd#2024",
    loginUrl: "https://app.hilms.test/login",
  });
  await emailService.sendMail({
    to: "grace@example.com",
    subject: "Your HILMS access request has been approved",
    text: approval.text,
    html: approval.html,
  });
  check("approval email links to /login", captured.html.includes("https://app.hilms.test/login"));
  check("approval email names the granted role", captured.text.includes("Doctor"));
  check("approval email contains the temporary password", captured.text.includes("Temp!Passw0rd#2024"));
  check("approval html contains the temporary password", captured.html.includes("Temp!Passw0rd#2024"));
  check("approval email forces a first-login change", /must change this password/i.test(captured.text));

  // ---- 6. Decline email creates no account ---------------------------
  console.log("\n6. Decline email");
  const declined = emailService.buildAccountRejectedEmail({
    name: "Alan Turing",
    email: "alan@example.com",
    roleLabel: "Laboratory",
  });
  await emailService.sendMail({ to: "alan@example.com", subject: "declined", text: declined.text, html: declined.html });
  check("decline email names the role", captured.text.includes("Laboratory"));
  check("decline email states no account was created", /no account was created/i.test(captured.text));
  check("decline email never contains a password", !/password:/i.test(captured.text));

  // ---- 7. Patient welcome ---------------------------------------------
  console.log("\n7. Patient welcome email");
  const welcome = emailService.buildPatientWelcomeEmail({
    name: "Mary Jackson",
    email: "mary@example.com",
    loginUrl: "https://app.hilms.test/login",
  });
  await emailService.sendMail({ to: "mary@example.com", subject: "Welcome", text: welcome.text, html: welcome.html });
  check("welcome email confirms the account is ready", /ready to use/i.test(captured.text));
  check("welcome email never contains a password", !/password:/i.test(captured.text));

  env.email.host = saved.host;
  env.email.from = saved.from;
  env.email.user = saved.user;
  env.email.password = saved.password;
  emailService.setTransport(null);

  console.log(`\n${"=".repeat(52)}\n  ${passed} passed, ${failed} failed\n${"=".repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error("\nEmail E2E crashed:", error);
  process.exit(1);
});
