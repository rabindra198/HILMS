// Confirms that the most recent real (non-fixture) approvals actually delivered
// their temporary-password email. Read-only.
require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const approvals = await AuditLog.find({ action: "ACCESS_REQUEST_APPROVED" })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  for (const entry of approvals) {
    const delivered = entry.metadata?.emailDelivered;
    const flag = delivered === true ? "DELIVERED" : delivered === false ? "FAILED" : "n/a";
    console.log(
      `${String(entry.createdAt).slice(0, 19)}  ${flag.padEnd(9)} ${entry.targetEmail || "?"}  (${entry.metadata?.requestedRole || "?"})`
    );
  }

  const recent = await User.find({ mustChangePassword: true }).sort({ createdAt: -1 }).limit(3).lean();
  for (const u of recent) {
    const notice = await Notification.countDocuments({ recipient: u._id });
    console.log(`\n${u.email}  role=${u.role} status=${u.status} active=${u.isActive} notifications=${notice}`);
  }

  await mongoose.disconnect();
})();
