/**
 * Bootstrap seed.
 *
 * Public registration is intentionally disabled, so the first Admin account
 * must be created out-of-band. This script is that mechanism - it writes a
 * real, bcrypt-hashed user to the database.
 *
 * Usage:
 *   npm run seed
 *
 * Optional overrides (all fall back to the values below):
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME
 *
 * The plain ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD names are also accepted as
 * aliases, so an environment can seed the development Admin without the SEED_
 * prefix. SEED_* wins when both are present.
 *
 * Re-running is safe: existing accounts are updated in place, not duplicated.
 */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const { ROLES } = require("../config/roles");

const pick = (...names) => names.map((n) => process.env[n]).find((v) => v !== undefined && v !== "");

const SEED_USERS = [
  {
    role: ROLES.ADMIN,
    name: pick("SEED_ADMIN_NAME", "ADMIN_NAME") || "HILMS Admin",
    email: (pick("SEED_ADMIN_EMAIL", "ADMIN_EMAIL") || "admin@hilms.com").toLowerCase(),
    password: pick("SEED_ADMIN_PASSWORD", "ADMIN_PASSWORD") || "Admin@123",
    passwordFromEnv: Boolean(pick("SEED_ADMIN_PASSWORD", "ADMIN_PASSWORD")),
  },
];

// The fallback password above is a development convenience only. Refuse to
// bootstrap the Admin account with it when NODE_ENV=production.
const assertSafeProductionRun = () => {
  if (process.env.NODE_ENV !== "production") return;

  const unsafe = SEED_USERS.filter((entry) => !entry.passwordFromEnv);
  if (unsafe.length === 0) return;

  console.error(
    "[seed] Refusing to run in production without an explicit password.\n" +
      "       Set this environment variable first:\n" +
      "         SEED_ADMIN_PASSWORD"
  );
  process.exit(1);
};

const seedUser = async ({ role, name, email, password }) => {
  const existing = await User.findOne({ email });

  if (existing) {
    existing.name = name;
    existing.role = role;
    existing.status = "APPROVED";
    existing.isActive = true;
    if (process.env.SEED_RESET_PASSWORD === "true") {
      existing.password = password;
    }
    await existing.save();
    return { email, role, created: false, passwordReset: process.env.SEED_RESET_PASSWORD === "true" };
  }

  await User.create({ name, email, password, role, status: "APPROVED", isActive: true });
  return { email, role, created: true, passwordReset: false };
};

const run = async () => {
  assertSafeProductionRun();
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    console.error("Could not connect to MongoDB. Check MONGO_URI in server/.env.");
    process.exit(1);
  }

  for (const seedUserConfig of SEED_USERS) {
    const result = await seedUser(seedUserConfig);
    const state = result.created ? "created" : result.passwordReset ? "updated (password reset)" : "already exists";
    console.log(`[seed] ${result.role.padEnd(10)} ${result.email} - ${state}`);
    if (result.created) {
      console.log(`[seed]    password: ${seedUserConfig.password}`);
    }
  }

  console.log("\n[seed] Done. Sign in at /login with the credentials above.");
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("[seed] Failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
