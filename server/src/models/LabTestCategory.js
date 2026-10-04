const mongoose = require("mongoose");

/**
 * A laboratory test category (SRS FR-LB-06 "manage test categories").
 *
 * Categories were previously only ever the free-text `category` string on a
 * LabTest, which means the list of departments the laboratory works in could not
 * be listed, renamed, reordered or retired - renaming one would have required
 * editing every test. This collection is the authoritative list; `LabTest.category`
 * still holds the category's name so existing reports keep rendering without a
 * join.
 *
 * `slug` is the stable key: renaming a category changes its display name but not
 * its slug, so the tests filed under it are unaffected.
 */
const labTestCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// The Tests screen groups by category in one query; this keeps that a covered
// index rather than an in-memory sort of every test.
labTestCategorySchema.index({ isActive: 1, order: 1, name: 1 });

/**
 * Derives a url/file-safe slug from a display name.
 *
 * Shared by the service and the catalogue seeder so a category created through
 * the UI and one created by a seed script always get the same key.
 */
labTestCategorySchema.statics.slugify = function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
};

module.exports = mongoose.model("LabTestCategory", labTestCategorySchema);
