/**
 * Verifies that the configured SMTP provider is reachable and that the
 * credentials actually authenticate.
 *
 * Uses `transporter.verify()`, which opens the connection, negotiates TLS and
 * logs in, but sends no email. That is the safe way to check a newly pasted
 * app password without spamming a real inbox.
 *
 * Run with: npm run check:smtp
 */

const nodemailer = require("nodemailer");
const env = require("../config/env");

const main = async () => {
  if (!env.email.host || !env.email.user || !env.email.password) {
    console.log("\nSMTP is not configured.");
    console.log("Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in server/.env first.");
    process.exitCode = 1;
    return;
  }

  // Never echo the password itself.
  console.log(`\nHost:   ${env.email.host}:${env.email.port}`);
  console.log(`Secure: ${env.email.secure ? "implicit TLS" : "STARTTLS"}`);
  console.log(`User:   ${env.email.user}`);
  console.log(`From:   ${env.email.from}\n`);

  const transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
    auth: { user: env.email.user, pass: env.email.password },
  });

  try {
    await transporter.verify();
    console.log("Connection OK. The provider accepted the credentials.");
    console.log("Emails will now be delivered instead of rolling back.");
  } catch (error) {
    console.log(`Connection FAILED: ${error.message}`);
    console.log("\nCommon causes:");
    console.log("  - The account has 2-Step Verification off, so no app password exists.");
    console.log("  - The app password was revoked or copied with extra spaces.");
    console.log("  - The provider requires an app password, not the account password.");
    process.exitCode = 1;
  }
};

main();
