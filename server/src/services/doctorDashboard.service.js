const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const LabRequest = require("../models/LabRequest");
const LabReport = require("../models/LabReport");
const Notification = require("../models/Notification");
const Prescription = require("../models/Prescription");
const User = require("../models/User");
const careTeamService = require("./careTeam.service");

// The set of report statuses a doctor may act on (VERIFIED or APPROVED). Imported
// so the release rule has one definition rather than a fourth copy that can drift.
const { RELEASED_REPORT_STATUSES: RELEASED } = require("./lab.service");

/**
 * The doctor dashboard aggregate (FR-DR-01).
 *
 * One endpoint rather than five, because the dashboard is a single screen and
 * five parallel requests would be five round trips for data that is read
 * together. Every query here is a `countDocuments` or a hard-limited list - no
 * full patient history is loaded (section 39).
 *
 * All counts are scoped to the doctor's assigned patients, so a revoked
 * assignment immediately removes the patient from the dashboard totals.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const { PATIENT_FIELDS, startOfDay, endOfDay, dayBounds } = require("./appointment.service");

/** Today's booked appointments, in clinic order. */
const todayAppointments = async (doctorId, patientIds) => {
  const now = new Date();
  const { from, to } = dayBounds(now);

  return Appointment.find({
    doctor: doctorId,
    patient: { $in: patientIds },
    appointmentDate: { $gte: from, $lte: to },
    status: { $nin: ["CANCELLED"] },
  })
    .populate("patient", PATIENT_FIELDS)
    .sort({ startMinutes: 1 })
    .limit(25)
    .lean();
};

/**
 * FR-DR-01 "pending laboratory reports".
 *
 * "Pending" from the doctor's side means a report they asked for that the lab
 * has verified but the doctor has not yet commented on. Reports still being
 * processed are counted separately so the doctor can see work still in flight
 * without it being confused with something waiting on them.
 */
const pendingLabReports = async (doctorId, patientIds) => {
  return LabReport.find({
    doctor: doctorId,
    patient: { $in: patientIds },
    status: { $in: RELEASED },
    // `doctorComments` is an array of sub-documents; exclude anything this
    // doctor has already reviewed so the list is genuinely actionable.
    "doctorComments": { $not: { $elemMatch: { doctor: doctorId } } },
  })
    .populate("patient", PATIENT_FIELDS)
    .populate("test", "name testName category")
    .populate("labRequest", "priority status requestedDate")
    .sort({ verifiedAt: 1 })
    .limit(25)
    .lean();
};

const inFlightLabRequests = async (doctorId, patientIds) =>
  LabRequest.find({
    doctor: doctorId,
    patient: { $in: patientIds },
    status: { $in: ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED"] },
  })
    .populate("patient", PATIENT_FIELDS)
    .populate("test", "name testName category")
    .sort({ priority: 1, requestedDate: 1 })
    .limit(25)
    .lean();

/**
 * FR-DR-01 "follow-up patients": appointments of type FOLLOW_UP that are still
 * in the future, i.e. patients the doctor owes a visit.
 */
const followUpPatients = async (doctorId, patientIds) => {
  const upcoming = await Appointment.find({
    doctor: doctorId,
    patient: { $in: patientIds },
    type: "FOLLOW_UP",
    status: { $nin: ["CANCELLED", "COMPLETED"] },
    appointmentDate: { $gte: startOfDay(new Date()) },
  })
    .populate("patient", PATIENT_FIELDS)
    .sort({ appointmentDate: 1, startMinutes: 1 })
    .limit(25)
    .lean();

  if (!upcoming.length) return [];

  // The diagnosis the follow-up was booked from, so the row answers "why am I
  // seeing this patient" without a second click.
  const consultationIds = upcoming.map((row) => row.followUpOf).filter(Boolean);
  const consultations = consultationIds.length
    ? await Consultation.find({ _id: { $in: consultationIds } })
        .select("diagnosis consultationNo completedAt")
        .lean()
    : [];
  const byId = new Map(consultations.map((row) => [String(row._id), row]));

  return upcoming.map((row) => ({
    ...row,
    previousConsultation: row.followUpOf ? byId.get(String(row.followUpOf)) || null : null,
  }));
};

const recentConsultations = async (doctorId, patientIds) => {
  const rows = await Consultation.find({ doctor: doctorId, patient: { $in: patientIds } })
    .populate("patient", PATIENT_FIELDS)
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (!rows.length) return [];

  const ids = rows.map((row) => row._id);

  // One aggregate for every consultation on screen, rather than a count query
  // per row - the dashboard must not fan out into N queries.
  const [prescriptionCounts] = await Promise.all([
    Prescription.aggregate([
      { $match: { consultation: { $in: ids } } },
      { $group: { _id: "$consultation", count: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map(prescriptionCounts.map((row) => [String(row._id), row.count]));

  return rows.map((row) => ({
    ...row,
    prescriptionCount: counts.get(String(row._id)) || 0,
    // Already denormalised onto the consultation by consultation.service.
    labRequestCount: (row.labRequests || []).length,
  }));
};

/** Builds the whole dashboard in one call. */
const build = async (doctorId) => {
  const doctor = await User.findOne({ _id: doctorId, role: "doctor" }).select(
    "name email nmcNumber department specialization"
  );
  if (!doctor) fail("Doctor not found", 404);

  const patientIds = await careTeamService.assignedPatientIds(doctorId);
  const { from, to } = dayBounds(new Date());

  if (!patientIds.length) {
    // A doctor with no care team is a valid state, not an error. Return the full
    // shape with zeroes so the dashboard renders its empty states properly
    // instead of crashing on undefined arrays.
    return {
      doctor: {
        id: doctor._id,
        name: doctor.name,
        department: doctor.department || "General Medicine",
        specialization: doctor.specialization || null,
        nmcNumber: doctor.nmcNumber || null,
      },
      date: new Date().toISOString(),
      // Must mirror the populated branch exactly. A missing key here reads as
      // `undefined` in the client, which renders a blank stat tile instead of 0.
      stats: {
        todayAppointments: 0,
        completedToday: 0,
        pendingLabReports: 0,
        inFlightLabRequests: 0,
        followUpPatients: 0,
        assignedPatients: 0,
        unreadNotifications: await Notification.countDocuments({ recipient: doctorId, readAt: null }),
      },
      todayAppointments: [],
      pendingLabReports: [],
      inFlightLabRequests: [],
      followUpPatients: [],
      recentConsultations: [],
    };
  }

  const [
    todaysList,
    reports,
    inFlight,
    followUps,
    recent,
    todayTotal,
    completedToday,
    assignedPatients,
    unreadNotifications,
  ] = await Promise.all([
    todayAppointments(doctorId, patientIds),
    pendingLabReports(doctorId, patientIds),
    inFlightLabRequests(doctorId, patientIds),
    followUpPatients(doctorId, patientIds),
    recentConsultations(doctorId, patientIds),
    Appointment.countDocuments({
      doctor: doctorId,
      patient: { $in: patientIds },
      appointmentDate: { $gte: from, $lte: to },
      status: { $nin: ["CANCELLED"] },
    }),
    Appointment.countDocuments({
      doctor: doctorId,
      patient: { $in: patientIds },
      appointmentDate: { $gte: from, $lte: to },
      status: "COMPLETED",
    }),
    User.countDocuments({
      _id: { $in: patientIds },
      role: "patient",
      status: "APPROVED",
      isActive: true,
    }),
    Notification.countDocuments({ recipient: doctorId, readAt: null }),
  ]);

  return {
    doctor: {
      id: doctor._id,
      name: doctor.name,
      department: doctor.department || "General Medicine",
      specialization: doctor.specialization || null,
      nmcNumber: doctor.nmcNumber || null,
    },
    date: new Date().toISOString(),
    stats: {
      todayAppointments: todayTotal,
      completedToday,
      pendingLabReports: reports.length,
      inFlightLabRequests: inFlight.length,
      followUpPatients: followUps.length,
      assignedPatients,
      unreadNotifications,
    },
    todayAppointments: todaysList,
    pendingLabReports: reports,
    inFlightLabRequests: inFlight,
    followUpPatients: followUps,
    recentConsultations: recent,
  };
};

module.exports = {
  build,
  todayAppointments,
  pendingLabReports,
  inFlightLabRequests,
  followUpPatients,
  recentConsultations,
};
