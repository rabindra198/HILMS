const mongoose = require("mongoose");

/**
 * Atomic sequence generator for human-readable business ids (Sample IDs,
 * Report IDs).
 *
 * WHY: the previous implementation derived the next number with
 * `findOne().sort()` + 1 and `countDocuments()` + 1. Both are read-then-write
 * races: two concurrent lab users both read the same "latest" value and both
 * try to claim the same id, which surfaces to the user as a duplicate-key 409.
 *
 * A single-document `findOneAndUpdate` with `$inc` is atomic in MongoDB, so two
 * concurrent callers are serialised by the server and always receive distinct
 * numbers. On first use the counter is seeded from the highest id already in
 * the collection, so switching over never re-issues an id that is in use.
 *
 * The unique index on `sampleId` / `reportId` remains the final backstop; the
 * caller retries on a duplicate key rather than swallowing it.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { _id: false, versionKey: false, timestamps: false }
);

const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

/**
 * @param {string} key        counter name, e.g. "sampleId:2026"
 * @param {Function} [seedFn] async () => number, used once to initialise the
 *                            counter from existing rows. Must return the
 *                            highest sequence number currently in use.
 * @returns {Promise<number>} the next unused sequence number
 */
const nextSequence = async (key, seedFn) => {
  const existing = await Counter.findById(key).select("seq").lean();
  if (!existing) {
    const seed = seedFn ? Number(await seedFn()) || 0 : 0;
    try {
      await Counter.create({ _id: key, seq: seed });
    } catch (error) {
      // 11000 here just means a concurrent caller seeded it first. That is the
      // outcome we wanted anyway, so it is not an error.
      if (error.code !== 11000) throw error;
    }
  }

  const doc = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true }).lean();
  return doc.seq;
};

/**
 * Reads the highest existing `SMP-2026-0007`-style number so a freshly created
 * counter continues the series instead of restarting it.
 */
const highestExistingSequence = async (Model, field, prefix) => {
  const latest = await Model.findOne({ [field]: { $regex: `^${prefix}` } })
    .sort({ createdAt: -1 })
    .select(field)
    .lean();
  if (!latest || !latest[field]) return 0;
  const parsed = Number.parseInt(String(latest[field]).split("-").pop(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Wraps a write so a lost unique-index race is retried instead of surfacing. */
const withDuplicateRetry = async (operation, attempts = 5) => {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation(i);
    } catch (error) {
      if (error.code !== 11000) throw error;
      lastError = error;
    }
  }
  throw lastError;
};

module.exports = { nextSequence, highestExistingSequence, withDuplicateRetry, Counter };
