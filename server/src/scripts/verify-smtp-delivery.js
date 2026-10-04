/**
 * Proves the configured SMTP provider really DELIVERS, not just that the
 * credentials authenticate.
 *
 * `check-smtp-connection.js` only calls transporter.verify(). This sends one
 * real message end-to-end and reports the provider's response, so a silent
 * spam-block or quota rejection cannot slip through unnoticed.
 *
 * The test mail goes to the account's own address (SMTP_USER) - it never
 * contacts a third party.
 *
 * Run: npm run verify:delivery
 */

require("dotenv").config();

const nodemailer = require("nodemailer");
const env = require("../config/env");
const { buildPatientTemporaryPasswordEmail } = require("../services/email.service");

const main = async () => {
  if (!env.email.host || !env.email.user || !env.email.password) {
    console.log("\nSMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in server/.env.");
    process.exitCode = 1;
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
    auth: { user: env.email.user, pass: env.email.password },
  });

  console.log(`\nHost:   ${env.email.host}:${env.email.port}`);
  console.log(`User:   ${env.email.user}`);
  console.log("Sending a real test message to the account's own address...\n");

  // Reuse the production template so this also checks the live content. The
  // builder returns the body only; the caller owns the subject line.
  const { text, html } = buildPatientTemporaryPasswordEmail({
    name: "SMTP Delivery Test",
    email: env.email.user,
    temporaryPassword: "T3st-Only-Not-Real",
    loginUrl: env.appUrl || "http://localhost:5173",
  });
  const subject = "HILMS - Your Temporary Login Password";

  const startedAt = Date.now();
  try {
    const info = await transporter.sendMail({
      from: env.email.from,
      to: env.email.user,
      subject,
      text,
      html,
    });

    console.log("Delivery OK.");
    console.log(`  Accepted by:  ${info.accepted.join(", ")}`);
    console.log(`  Message ID:   ${info.messageId}`);
    console.log(`  Response:     ${info.response}`);
    console.log(`  Round trip:   ${Date.now() - startedAt}ms`);
    console.log(`\nCheck ${env.email.user} for the "${subject}" message.`);
  } catch (error) {
    console.log(`Delivery FAILED: ${error.message}`);
    if (error.responseCode) console.log(`  Response code: ${error.responseCode}`);
    if (error.command) console.log(`  Failed during:  ${error.command}`);
    process.exitCode = 1;
  }
};

main();
