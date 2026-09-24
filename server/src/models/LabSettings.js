const mongoose = require("mongoose");

const labSettingsSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  urgentRequestAlerts: { type: Boolean, default: true },
  processingAlerts: { type: Boolean, default: true },
  reportVerificationAlerts: { type: Boolean, default: true },
  emailNotifications: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("LabSettings", labSettingsSchema);
