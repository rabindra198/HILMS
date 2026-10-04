const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  entityType: { type: String, trim: true },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  readAt: { type: Date, default: null },
}, { timestamps: true });

// Every notification read is "my unread, newest first" plus the unread-count
// badge, so recipient + readAt + createdAt are indexed together.
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
