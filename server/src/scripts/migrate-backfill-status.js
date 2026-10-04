require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");

/**
 * Idempotent data migration: backfill `status` on accounts created before the
 * field existed.
 *
 * `protect` rejects any account whose `status !== "APPROVED"`, so a document
 * with a missing `status` is locked out permanently and the frontend can only
 * show a generic 403. The schema default does not help here - Mongoose only
 * applies defaults to newly created documents, never to ones already stored.
 */
(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const missing = await User.find({ $or: [{ status: { $exists: false } }, { status: null }] })
    .select("email role status isActive")
    .lean();

  console.log(`accounts with no status: ${missing.length}`);
  for (const u of missing) {
    console.log(`  ${u.email} [${u.role}] isActive=${u.isActive}`);
  }
  if (missing.length === 0) {
    console.log("nothing to do");
    await mongoose.disconnect();
    return;
  }

  const result = await User.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    // Keep isActive in lockstep with status, matching the model's pre-save hook.
    { $set: { status: "APPROVED", isActive: true } }
  );
  console.log(`backfilled: ${result.modifiedCount}`);

  const stillMissing = await User.countDocuments({
    $or: [{ status: { $exists: false } }, { status: null }],
  });
  console.log(`accounts still missing status: ${stillMissing}`);
  await mongoose.disconnect();
})();
