const mongoose = require("mongoose");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const LabRequest = require("../models/LabRequest");
const Invoice = require("../models/Invoice");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const { ROLES, isAdminRole } = require("../config/roles");
const { userResource } = require("../resources/userResource");
const { calculateAge, formatDate } = require("../utils/clinical");
const auditService = require("./audit.service");
const notificationService = require("./notification.service");
const medicalHistoryService = require("./medicalHistory.service");
const billingService = require("./billing.service");

/**
 * Patient administration (FR-AD-02).
 *
 * One service owns the patient record for every role that reads it, so the
 * demographic form, the admin list row and the printable clinical header cannot
 * disagree about which fields exist. The clinical timeline is NOT rebuilt here -
 * it is delegated to `medicalHistoryService.buildHistory`, the same projection the
 * doctor workspace renders, so an administrator sees exactly what the treating
 * doctor sees.
 *
 * The only thing that changes between callers is authorisation, and that is
 * applied at the router (`isAdmin`) rather than per-function here.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const objectId = (value, name = "id") => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) fail(`A valid ${name} is required`, 422);
  return value;
};

/** Everything the clinical header and the admin list render. */
const PATIENT_LIST_FIELDS =
  "name email phone contactNumber address dateOfBirth gender bloodGroup allergies emergencyContactName emergencyContactNumber status isActive createdAt";

const DEMOGRAPHIC_FIELDS = [
  "name",
  "email",
  "phone",
  "contactNumber",
  "address",
  "dateOfBirth",
  "gender",
  "bloodGroup",
  "allergies",
  "emergencyContactName",
  "emergencyContactNumber",
];

/**
 * Paginated patient list.
 *
 * The previous version returned every patient in one array and let the browser
 * filter it, which is unusable past a few hundred records and puts every patient's
 * demographics in a payload a user may not need. Counts and the slice both come
 * from the database here.
 */
const listPatients = async (query = {}) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const filter = { role: ROLES.PATIENT };

  if (query.status) {
    const wanted = String(query.status).trim().toUpperCase();
    if (!["APPROVED", "PENDING", "REJECTED"].includes(wanted)) {
      fail(`Patient status "${query.status}" is not valid`, 422);
    }
    filter.status = wanted;
  }

  if (query.search) {
    const regex = new RegExp(billingService.escapeRegex(String(query.search).trim()), "i");
    filter.$or = [
      { name: regex },
      { email: regex },
      { phone: regex },
      { contactNumber: regex },
    ];
  }

  const [rows, total] = await Promise.all([
    User.find(filter)
      .select(PATIENT_LIST_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const items = await withClinicalCounts(rows);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

/**
 * Adds the per-patient activity counters shown on the list.
 *
 * One grouped aggregation rather than a count per patient - five hundred patients
 * would otherwise be five hundred round trips.
 */
const withClinicalCounts = async (patients) => {
  if (!patients.length) return [];

  const ids = patients.map((patient) => patient._id);

  const [appointments, consultations, labRequests, invoices, doctors] = await Promise.all([
    Appointment.aggregate([
      { $match: { patient: { $in: ids }, status: { $ne: "CANCELLED" } } },
      { $group: { _id: "$patient", count: { $sum: 1 }, last: { $max: "$appointmentDate" } } },
    ]),
    Consultation.aggregate([{ $match: { patient: { $in: ids } } }, { $group: { _id: "$patient", count: { $sum: 1 } } }]),
    LabRequest.aggregate([{ $match: { patient: { $in: ids } } }, { $group: { _id: "$patient", count: { $sum: 1 } } }]),
    Invoice.aggregate([
      { $match: { patient: { $in: ids }, status: { $ne: "VOID" } } },
      { $group: { _id: "$patient", count: { $sum: 1 }, balance: { $sum: "$balance" } } },
    ]),
    DoctorPatientAssignment.aggregate([
      // `revokedAt: null` is the model for a live assignment (see its partial
      // unique index) - there is no `isActive` flag on this collection.
      { $match: { patient: { $in: ids }, revokedAt: null } },
      { $group: { _id: "$patient", doctors: { $sum: 1 } } },
    ]),
  ]);

  const index = (rows) => new Map(rows.map((row) => [String(row._id), row]));

  const appointmentMap = index(appointments);
  const consultationMap = index(consultations);
  const labMap = index(labRequests);
  const invoiceMap = index(invoices);
  const doctorMap = index(doctors);

  return patients.map((patient) => {
    const key = String(patient._id);
    return {
      ...patient,
      contactNumber: patient.contactNumber || patient.phone || null,
      age: calculateAge(patient.dateOfBirth),
      reference: `PT-${String(patient._id).slice(-6).toUpperCase()}`,
      stats: {
        appointments: appointmentMap.get(key)?.count || 0,
        lastAppointment: appointmentMap.get(key)?.last || null,
        consultations: consultationMap.get(key)?.count || 0,
        labRequests: labMap.get(key)?.count || 0,
        invoices: invoiceMap.get(key)?.count || 0,
        outstandingBalance: billingService.round(invoiceMap.get(key)?.balance || 0),
        assignedDoctors: doctorMap.get(key)?.doctors || 0,
      },
    };
  });
};

/**
 * The full patient record behind the admin drawer: demographics, activity
 * counters, assigned doctors, care team and the shared clinical timeline.
 */
const getPatient = async (patientId, query = {}) => {
  const id = objectId(patientId, "patient id");

  const patient = await User.findOne({ _id: id, role: ROLES.PATIENT })
    .select(PATIENT_LIST_FIELDS)
    .lean();
  if (!patient) fail("Patient not found", 404);

  const [stats, history, billing, assignedDoctors] = await Promise.all([
    withClinicalCounts([patient]),
    medicalHistoryService.buildHistory(id, { limit: Number.parseInt(query.historyLimit, 10) || 20 }),
    billingService.getPatientBilling(id),
    DoctorPatientAssignment.find({ patient: id, revokedAt: null })
      .populate("doctor", "name email department nmcNumber")
      .sort({ assignedAt: -1 })
      .lean(),
  ]);

  return {
    ...stats[0],
    formattedDateOfBirth: patient.dateOfBirth ? formatDate(patient.dateOfBirth) : null,
    assignedDoctors,
    history,
    billing: billing.summary,
    invoices: billing.invoices.slice(0, 10),
  };
};

/**
 * Updates a patient's demographics.
 *
 * `role` and `status` are deliberately not writable here: role changes go through
 * the privileged role endpoint and account status through the lifecycle endpoint,
 * so an ordinary profile edit cannot escalate an account.
 */
const updatePatient = async (patientId, payload, actor, req) => {
  const id = objectId(patientId, "patient id");
  const patient = await User.findById(id);
  if (!patient) fail("Patient not found", 404);
  if (patient.role !== ROLES.PATIENT) fail("That account is not a patient", 422);

  const update = {};
  for (const field of DEMOGRAPHIC_FIELDS) {
    if (payload[field] === undefined) continue;
    update[field] = payload[field];
  }

  if (update.email && update.email !== patient.email) {
    const email = String(update.email).trim().toLowerCase();
    const taken = await User.findOne({ email, _id: { $ne: patient._id } }).select("_id").lean();
    if (taken) fail("Another account already uses that email address", 409);
    update.email = email;
  }

  if (update.gender !== undefined && update.gender && !["male", "female", "other"].includes(update.gender)) {
    fail("Gender must be male, female or other", 422);
  }

  if (update.dateOfBirth) {
    const parsed = new Date(update.dateOfBirth);
    if (Number.isNaN(parsed.getTime())) fail("Date of birth is not a valid date", 422);
    if (parsed > new Date()) fail("Date of birth cannot be in the future", 422);
    update.dateOfBirth = parsed;
  }

  if (Object.keys(update).length === 0) fail("There is nothing to update", 422);

  const changed = Object.keys(update).filter((field) => String(patient[field] ?? "") !== String(update[field] ?? ""));
  Object.assign(patient, update);
  await patient.save();

  await auditService.record({
    action: "PATIENT_UPDATED",
    actor,
    targetType: "User",
    targetId: patient._id,
    targetEmail: patient.email,
    metadata: { changed },
    req,
  });

  await notificationService.notifyAdmins({
    type: "PATIENT_UPDATED",
    title: "Patient record updated",
    message: `${actor?.name || "An administrator"} updated ${changed.join(", ") || "details"} for ${patient.name}.`,
    entityType: "User",
    entityId: patient._id,
    preference: "patientAlerts",
  });

  return userResource(patient);
};

/**
 * The signed-in administrator's own profile.
 *
 * Scoped to the fields a person owns. Role, status and `isActive` are absent from
 * the writable set on purpose: self-service must not become a privilege-escalation
 * path.
 */
const getMyProfile = async (adminId) => {
  const admin = await User.findById(objectId(adminId, "admin id"));
  if (!admin) fail("Account not found", 404);
  if (!isAdminRole(admin.role)) fail("Only an administrator can view this profile", 403);
  return userResource(admin);
};

const updateMyProfile = async (adminId, payload, actor, req) => {
  const admin = await User.findById(objectId(adminId, "admin id"));
  if (!admin) fail("Account not found", 404);
  if (!isAdminRole(admin.role)) fail("Only an administrator can update this profile", 403);

  const update = {};
  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) fail("Name is required", 422);
    update.name = name;
  }
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    const taken = await User.findOne({ email, _id: { $ne: admin._id } }).select("_id").lean();
    if (taken) fail("Another account already uses that email address", 409);
    update.email = email;
  }
  if (payload.phone !== undefined || payload.contactNumber !== undefined) {
    update.contactNumber = String(payload.contactNumber ?? payload.phone ?? "").trim();
  }
  if (payload.address !== undefined) update.address = String(payload.address).trim();

  if (!Object.keys(update).length) fail("There is nothing to update", 422);

  Object.assign(admin, update);
  await admin.save();

  await auditService.record({
    action: "ADMIN_PROFILE_UPDATED",
    actor,
    targetType: "User",
    targetId: admin._id,
    targetEmail: admin.email,
    metadata: { changed: Object.keys(update) },
    req,
  });

  return userResource(admin);
};

/**
 * Notification preferences.
 *
 * Stored on `AdminSettings`, the same shape `DoctorSettings` and `LabSettings`
 * use, so there is one place per role and no shared table with nullable columns.
 */
const getMySettings = async (adminId) => notificationService.getOrCreateSettings(adminId);

const updateMySettings = async (adminId, payload, actor) => {
  const settings = await notificationService.getOrCreateSettings(adminId);

  const ALLOWED = [
    "accessRequestAlerts",
    "appointmentAlerts",
    "patientAlerts",
    "laboratoryAlerts",
    "billingAlerts",
    "emailNotifications",
  ];

  const changed = [];
  for (const field of ALLOWED) {
    if (payload[field] === undefined) continue;
    const value = Boolean(payload[field]);
    if (settings[field] === value) continue;
    settings[field] = value;
    changed.push(field);
  }

  if (changed.length) {
    await settings.save();
    await auditService.record({
      action: "ADMIN_SETTINGS_UPDATED",
      actor,
      targetType: "AdminSettings",
      targetId: settings._id,
      metadata: { changed },
    });
  }

  return settings;
};

module.exports = {
  listPatients,
  getPatient,
  updatePatient,
  getMyProfile,
  updateMyProfile,
  getMySettings,
  updateMySettings,
  withClinicalCounts,
  PATIENT_LIST_FIELDS,
  DEMOGRAPHIC_FIELDS,
};