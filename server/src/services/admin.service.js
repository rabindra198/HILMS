const mongoose = require("mongoose");

const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { ROLES, normalizeRole, resolveRole, ROLE_VALUES, isPrivilegedRole, isAdminRole } = require("../config/roles");
const { userResource } = require("../resources/userResource");
const auditService = require("./audit.service");
const scheduleService = require("./schedule.service");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const objectId = (value, name = "id") => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    fail(`Valid ${name} is required`);
  }
  return value;
};

const getUsers = async ({ role, status, search } = {}) => {
  const filter = {};
  // An unrecognised role must match nothing rather than falling back to
  // "patient" via normalizeRole and leaking the wrong user list.
  if (role) filter.role = resolveRole(role) || "__unmatched_role__";
  if (status) filter.status = String(status).trim().toUpperCase();
  if (search) {
    const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: new RegExp(safe, "i") }, { email: new RegExp(safe, "i") }];
  }

  const users = await User.find(filter).sort({ createdAt: -1 });
  return users.map(userResource);
};

/**
 * Role assignment. Authorised on the server, never by the client:
 *  - nobody may change their own role
 *  - the Admin role is privileged, so only an Admin may grant, change or revoke
 *    it. Everyone else is limited to Patient / Doctor / Laboratory.
 */
const updateUserRole = async (userId, payload = {}, actor) => {
  objectId(userId, "user id");

  // Accept documented aliases ("laboratory" -> "lab") but reject anything
  // unrecognised outright rather than defaulting to a role.
  const nextRole = resolveRole(payload.role);
  if (!nextRole) {
    fail(`Invalid role. Allowed roles: ${ROLE_VALUES.join(", ")}`);
  }

  const user = await User.findById(userId);
  if (!user) fail("User not found", 404);

  if (user._id.equals(actor._id)) {
    fail("You cannot change your own role", 403);
  }

  const targetIsPrivileged = isPrivilegedRole(user.role);
  const nextIsPrivileged = isPrivilegedRole(nextRole);

  if (targetIsPrivileged && !isAdminRole(actor.role)) {
    fail("Only an Admin can change an Admin account", 403);
  }
  if (nextIsPrivileged && !isAdminRole(actor.role)) {
    fail("Only an Admin can grant the Admin role", 403);
  }

  const previousRole = user.role;
  user.role = nextRole;
  // Changing role implies the account is in good standing.
  user.status = "APPROVED";
  user.isActive = true;
  await user.save();

  await auditService.record({
    action: "USER_ROLE_UPDATED",
    actor,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { previousRole, nextRole },
  });

  return userResource(user);
};

const setUserStatus = async (userId, payload = {}, actor) => {
  objectId(userId, "user id");
  const nextStatus = String(payload.status || "").trim().toUpperCase();

  if (!["APPROVED", "REJECTED", "PENDING"].includes(nextStatus)) {
    fail("Invalid status. Use: APPROVED, PENDING or REJECTED");
  }

  const user = await User.findById(userId);
  if (!user) fail("User not found", 404);
  if (user._id.equals(actor._id)) {
    fail("You cannot change the status of your own account", 403);
  }

  const previousStatus = user.status;
  user.status = nextStatus;
  user.isActive = nextStatus === "APPROVED";
  await user.save();

  await auditService.record({
    action: "USER_STATUS_UPDATED",
    actor,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { previousStatus, nextStatus },
  });

  return userResource(user);
};

const deleteUser = async (userId, actor) => {
  objectId(userId, "user id");

  const user = await User.findById(userId);
  if (!user) fail("User not found", 404);
  if (user._id.equals(actor._id)) {
    fail("You cannot delete your own account", 400);
  }
  if (isPrivilegedRole(user.role) && !isAdminRole(actor.role)) {
    fail("Only an Admin can delete an Admin account", 403);
  }

  await user.deleteOne();

  await auditService.record({
    action: "USER_DELETED",
    actor,
    targetType: "User",
    targetId: user._id,
    targetEmail: user.email,
    metadata: { role: user.role },
  });

  return { message: "User deleted successfully" };
};

/** System-wide role/user counts for the Admin overview. */
const getSystemOverview = async () => {
  const [total, byRole, byStatus] = await Promise.all([
    User.countDocuments(),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const roleCounts = ROLE_VALUES.reduce((acc, role) => ({ ...acc, [role]: 0 }), {});
  byRole.forEach((entry) => {
    roleCounts[normalizeRole(entry._id)] = entry.count;
  });

  const statusCounts = { APPROVED: 0, PENDING: 0, REJECTED: 0 };
  byStatus.forEach((entry) => {
    if (entry._id) statusCounts[String(entry._id).toUpperCase()] = entry.count;
  });

  return { total, roleCounts, statusCounts };
};

/**
 * The doctor list behind the availability screen (FR-AD-04).
 *
 * Includes each doctor's published availability alongside their workload, because
 * the question an administrator is actually answering is "when can this doctor
 * take a patient?", and that needs both sides in one row. The schedule summary is
 * produced by `schedule.service` - the same source the booking path validates
 * against - so the grid can never show hours that bookings ignore.
 */
const getDoctors = async ({ search, status, limit: limitInput, page: pageInput } = {}) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitInput, 10) || 20));
  const page = Math.max(1, Number.parseInt(pageInput, 10) || 1);

  const filter = { role: ROLES.DOCTOR };
  if (status) filter.status = String(status).trim().toUpperCase();
  if (search) {
    const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: new RegExp(safe, "i") },
      { email: new RegExp(safe, "i") },
      { nmcNumber: new RegExp(safe, "i") },
      { department: new RegExp(safe, "i") },
    ];
  }

  // Workload and schedules are keyed by the *unfiltered* doctor set, not the
  // current page: running the same paged query for the `$in` lists would make
  // every appointment count on page 2+ read as zero.
  const doctorIds = await User.find(filter).select("_id").lean();

  const [doctors, total, appointments, schedules] = await Promise.all([
    User.find(filter)
      .select("name email phone contactNumber nmcNumber department specialization qualification consultationFee status isActive createdAt")
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    Appointment.aggregate([
      {
        $match: {
          // `_id`, not the document: `$in` against ObjectIds, otherwise every
          // document fails to match and workload silently reads as zero.
          doctor: { $in: doctorIds.map((row) => row._id) },
          status: { $ne: "CANCELLED" },
        },
      },
      { $group: { _id: "$doctor", total: { $sum: 1 }, upcoming: { $sum: { $cond: [{ $gte: ["$appointmentDate", new Date()] }, 1, 0] } } } },
    ]),
    scheduleService.listForDoctors(doctorIds.map((row) => row._id)),
  ]);

  const appointmentMap = new Map(appointments.map((row) => [String(row._id), row]));

  const items = doctors.map((doctor) => {
    const windows = schedules.get(String(doctor._id)) || [];
    const workload = appointmentMap.get(String(doctor._id));

    return {
      ...doctor,
      reference: `DR-${String(doctor._id).slice(-6).toUpperCase()}`,
      availability: {
        // No rows at all means the booking path falls back to the default clinic
        // hours - the screen says so rather than showing an empty week.
        usingDefault: windows.length === 0,
        windows,
        days: [...new Set(windows.filter((window) => window.isActive).map((window) => window.weekday))].sort(),
      },
      stats: {
        appointments: workload?.total || 0,
        upcoming: workload?.upcoming || 0,
      },
    };
  });

  return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

/**
 * Updates a doctor's professional details, including the consultation fee.
 *
 * `consultationFee` lives here because it is a billing input: `billing.service`
 * prices a consultation line from this value rather than from a number typed into
 * an invoice form. An administrator with no fee set for a doctor cannot issue an
 * invoice for that doctor's consultation at all, so it has to be editable from the
 * same screen that manages the doctor's availability.
 *
 * Role and status are not writable here - those go through the privileged role
 * and lifecycle endpoints.
 */
const DOCTOR_FIELDS = [
  "name",
  "email",
  "phone",
  "contactNumber",
  "address",
  "department",
  "specialization",
  "qualification",
  "nmcNumber",
  "consultationFee",
];

const updateDoctor = async (doctorId, payload = {}, actor, req) => {
  objectId(doctorId, "doctor id");

  const doctor = await User.findById(doctorId);
  if (!doctor) fail("Doctor not found", 404);
  if (doctor.role !== ROLES.DOCTOR) fail("That account is not a doctor", 422);

  const update = {};
  for (const field of DOCTOR_FIELDS) {
    if (payload[field] === undefined) continue;
    update[field] = payload[field];
  }

  if (!Object.keys(update).length) fail("There is nothing to update", 422);

  if (update.email && update.email !== doctor.email) {
    const email = String(update.email).trim().toLowerCase();
    const taken = await User.findOne({ email, _id: { $ne: doctor._id } }).select("_id").lean();
    if (taken) fail("Another account already uses that email address", 409);
    update.email = email;
  }

  if (update.nmcNumber) {
    const nmcNumber = String(update.nmcNumber).trim().toUpperCase();
    const taken = await User.findOne({ nmcNumber, _id: { $ne: doctor._id } }).select("_id").lean();
    if (taken) fail("Another doctor already uses that NMC number", 409);
    update.nmcNumber = nmcNumber;
  }

  // `null` clears the fee ("bill this doctor manually"), which is different from
  // omitting it - so the field has to be explicitly accepted as null.
  if (update.consultationFee !== undefined) {
    if (update.consultationFee === null || update.consultationFee === "") {
      update.consultationFee = null;
    } else {
      const fee = Number(update.consultationFee);
      if (!Number.isFinite(fee) || fee < 0) fail("Consultation fee must be 0 or more", 422);
      update.consultationFee = fee;
    }
  }

  Object.assign(doctor, update);
  await doctor.save();

  await auditService.record({
    action: "DOCTOR_UPDATED",
    actor,
    targetType: "User",
    targetId: doctor._id,
    targetEmail: doctor.email,
    metadata: { changed: Object.keys(update) },
    req,
  });

  return userResource(doctor);
};

module.exports = {
  getUsers,
  getDoctors,
  updateDoctor,
  updateUserRole,
  setUserStatus,
  deleteUser,
  getSystemOverview,
  DOCTOR_FIELDS,
};
