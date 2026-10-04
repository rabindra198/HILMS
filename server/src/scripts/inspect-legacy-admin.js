require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");
const AccessRequest = require("../models/AccessRequest");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const PasswordResetToken = require("../models/PasswordResetToken");

const EMAIL = process.argv[2];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email: EMAIL }).select("+password").lean();
  if (!user) {
    console.log("no such user:", EMAIL);
    await mongoose.disconnect();
    return;
  }
  console.log("user        :", {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    passwordIsBcrypt: /^\$2[aby]\$/.test(user.password || ""),
  });
  console.log("requests    :", await AccessRequest.countDocuments({ user: user._id }));
  console.log("requested   :", await AccessRequest.countDocuments({ reviewedBy: user._id }));
  console.log("reviewsMade :", await AccessRequest.countDocuments({ reviewedBy: user._id }));
  console.log("byEmail     :", await AccessRequest.countDocuments({ email: EMAIL }));
  console.log("notifications:", await Notification.countDocuments({ recipient: user._id }));
  console.log("resetTokens :", await PasswordResetToken.countDocuments({ user: user._id }));
  console.log("auditAsActor:", await AuditLog.countDocuments({ actor: user._id }));
  console.log("auditAsTarget:", await AuditLog.countDocuments({ targetEmail: EMAIL }));

  if (!process.argv.includes("--remove")) {
    await mongoose.disconnect();
    return;
  }

  // Refuse to remove an account that is actually in use - a real Admin, or one
  // that has reviewed requests or owns notifications, must never vanish.
  if (user.role === "patient" || user.role === "doctor" || user.role === "lab") {
    throw new Error(`refusing to remove a ${user.role} account`);
  }
  const reviews = await AccessRequest.countDocuments({ reviewedBy: user._id });
  const notifs = await Notification.countDocuments({ recipient: user._id });
  if (reviews || notifs) {
    throw new Error(`refusing to remove an in-use account (${reviews} reviews, ${notifs} notifications)`);
  }

  const result = await User.deleteOne({ _id: user._id });
  await PasswordResetToken.deleteMany({ user: user._id });
  await Notification.deleteMany({ recipient: user._id });
  await AuditLog.deleteMany({ targetEmail: EMAIL });
  console.log("REMOVED     :", EMAIL, `(deletedCount=${result.deletedCount})`);
  console.log("still exists:", (await User.countDocuments({ email: EMAIL })) > 0);
  await mongoose.disconnect();
})();
