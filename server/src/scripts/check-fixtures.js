require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const PasswordResetToken = require("../models/PasswordResetToken");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");

const FIXTURE = { $regex: "^e2e|@e2e\\.io$|^live", $options: "i" };

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const byEmail = { email: FIXTURE };
  const byTarget = { targetEmail: FIXTURE };

  if (process.argv.includes("--purge")) {
    const purged = await AuditLog.deleteMany(byTarget);
    console.log("purged stale e2e audit logs:", purged.deletedCount);
  }

  const rows = {
    "e2e users": await User.countDocuments(byEmail),
    "e2e access requests": await AccessRequest.countDocuments(byEmail),
    "e2e audit logs": await AuditLog.countDocuments(byTarget),
  };
  console.log(rows);
  console.log("total users:", await User.countDocuments());
  console.log("total audit logs (real entries):", await AuditLog.countDocuments());
  const leaked = await User.find({ email: FIXTURE }).select("email role").lean();
  console.log("leaked users:", JSON.stringify(leaked));

  // Role census, so an unexpected role value (e.g. a resurrected "superadmin")
  // shows up here rather than surfacing as a broken login later.
  const byRole = await User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]);
  console.log("users by role:", JSON.stringify(byRole));
  const superadminRows = await User.find({ role: { $regex: "superadmin", $options: "i" } })
    .select("email role")
    .lean();
  console.log("users with a superadmin role:", JSON.stringify(superadminRows));

  // Anything holding a temporary-password flag is listed, since such an account
  // cannot reach anything except the change-password screen.
  const forced = await User.find({ mustChangePassword: true })
    .select("email role mustChangePassword")
    .lean();
  console.log("accounts still holding a temporary password:", JSON.stringify(forced));

  const all = await User.find({}).select("email role status isActive createdAt").sort({ createdAt: 1 }).lean();
  console.log("\nfull account list:");
  for (const u of all) {
    console.log(
      `  ${u.email}  [${u.role}/${u.status}] active=${u.isActive} created=${new Date(u.createdAt).toISOString().slice(0, 10)}`
    );
  }

  await mongoose.disconnect();
})();
