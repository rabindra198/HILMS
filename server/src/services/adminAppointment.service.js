const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const { APPOINTMENT_TYPES, APPOINTMENT_STATUSES } = require("../models/Appointment");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const appointmentService = require("./appointment.service");
const scheduleService = require("./schedule.service");
const auditService = require("./audit.service");
const notificationService = require("./notification.service");
const billingService = require("./billing.service");
const { withDuplicateRetry } = require("../utils/sequence");

/**
 * Hospital-wide appointment administration (FR-AD-02 / FR-AD-03).
 *
 * WHY this is separate from `appointment.service`: that module is deliberately
 * scoped to ONE doctor and, where a doctor is the actor, to patients on that
 * doctor's care team. An administrator has no care team and no doctor of their
 * own, so every function there is unavailable here - yet the booking, conflict,
 * availability and numbering rules must be exactly the same ones a patient goes
 * through. Those rules are therefore reached through the existing service rather
 * than re-implemented:
 *
 *  - numbering            -> appointmentService.nextAppointmentNo (via book)
 *  - double-booking check -> appointmentService.assertSlotFree
 *  - clinic hours         -> scheduleService.assertWithinAvailability
 *
 * What this module adds is the cross-doctor list, the queue and the administrative
 * transitions (reschedule, admin cancellation) that no patient or doctor may make.
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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Money rounding has one definition in this codebase, so the reports and the
// queue cannot disagree about what "2.005" is.
const round = billingService.round;

const PATIENT_FIELDS = "name email phone contactNumber";
const DOCTOR_FIELDS = "name email department nmcNumber consultationFee";

const minutesToLabel = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const startOfDay = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

const endOfDay = (date) => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

const dayBounds = (dateInput) => {
  const parsed = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(parsed.getTime())) fail("Date is not valid", 422);
  return { from: startOfDay(parsed), to: endOfDay(parsed) };
};

/** Adds the derived display fields every Admin appointment row needs. */
const present = (row) => {
  const appointment = typeof row.toObject === "function" ? row.toObject() : row;
  const patient = appointment.patient;
  const doctor = appointment.doctor;

  return {
    ...appointment,
    patient: patient && patient._id ? patient : { _id: patient?._id || patient, name: patient?.name || "Unknown patient" },
    doctor: doctor && doctor._id ? doctor : { _id: doctor?._id || doctor, name: doctor?.name || "Unassigned" },
    startTime: minutesToLabel(appointment.startMinutes),
    endTime: minutesToLabel(appointment.startMinutes + (appointment.durationMinutes || 30)),
    patientName: patient?.name || "Unknown patient",
    doctorName: doctor?.name || "Unassigned",
  };
};

/**
 * The shared filter builder.
 *
 * `scope` mirrors the doctor list vocabulary so the Admin list and the doctor list
 * mean the same thing by the same word.
 */
const buildFilter = async (query = {}) => {
  const filter = {};

  if (query.date) {
    const { from, to } = dayBounds(query.date);
    filter.appointmentDate = { $gte: from, $lte: to };
  } else {
    switch (query.scope) {
      case "today": {
        const { from, to } = dayBounds();
        filter.appointmentDate = { $gte: from, $lte: to };
        break;
      }
      case "upcoming":
        filter.appointmentDate = { $gte: startOfDay(new Date()) };
        break;
      case "past":
        filter.appointmentDate = { $lte: endOfDay(new Date(Date.now() - 86400000)) };
        break;
      default:
        break;
    }
  }

  if (query.status) {
    const wanted = String(query.status).toUpperCase();
    if (!APPOINTMENT_STATUSES.includes(wanted)) fail(`Appointment status "${query.status}" is not valid`, 422);
    filter.status = wanted;
  }

  if (query.type) {
    const wanted = String(query.type).toUpperCase();
    if (!APPOINTMENT_TYPES.includes(wanted)) fail(`Appointment type "${query.type}" is not valid`, 422);
    filter.type = wanted;
  }

  if (query.doctorId) filter.doctor = objectId(query.doctorId, "doctor id");
  if (query.patientId) filter.patient = objectId(query.patientId, "patient id");

  if (query.search) {
    const regex = new RegExp(escapeRegex(String(query.search).trim()), "i");
    const patientIds = await User.find({
      $or: [{ name: regex }, { email: regex }, { phone: regex }, { contactNumber: regex }],
    })
      .select("_id")
      .lean();
    const doctorIds = await User.find({ role: "doctor", $or: [{ name: regex }, { nmcNumber: regex }] })
      .select("_id")
      .lean();

    filter.$or = [
      { appointmentNo: regex },
      { reason: regex },
      { patient: { $in: patientIds.map((row) => row._id) } },
      { doctor: { $in: doctorIds.map((row) => row._id) } },
    ];
  }

  return filter;
};

const list = async (query = {}) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const filter = await buildFilter(query);

  const [rows, total] = await Promise.all([
    Appointment.find(filter)
      .populate("patient", PATIENT_FIELDS)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ appointmentDate: -1, startMinutes: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  return {
    items: rows.map(present),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

/** One appointment with its patient, doctor and billing links. */
const getOne = async (appointmentId) => {
  const appointment = await Appointment.findById(objectId(appointmentId, "appointment id"))
    .populate("patient", PATIENT_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .lean();
  if (!appointment) fail("Appointment not found", 404);

  const invoice = await Invoice.findOne({ appointment: appointment._id, status: { $ne: "VOID" } })
    .select("invoiceNo total amountPaid balance status")
    .lean()
    .catch(() => null);

  return { ...present(appointment), invoice: invoice || null };
};

/**
 * Books an appointment on a patient's behalf.
 *
 * Goes through the same numbering, availability and double-booking rules a
 * patient's own booking does, so an appointment created by an Admin is
 * indistinguishable from one created by the patient - there is one set of rules
 * and one appointment number series.
 */
const create = async (payload, actor, req) => {
  const patientId = objectId(payload.patientId, "patient id");
  const doctorId = objectId(payload.doctorId, "doctor id");

  const patient = await User.findOne({ _id: patientId, role: "patient" }).select("_id name email").lean();
  if (!patient) fail("Patient not found", 404);

  const doctor = await User.findOne({
    _id: doctorId,
    role: "doctor",
    status: "APPROVED",
    isActive: true,
  })
    .select("_id name email")
    .lean();
  if (!doctor) fail("Doctor not found or not available for booking", 404);

  const type = String(payload.type || "CONSULTATION").toUpperCase();
  if (!APPOINTMENT_TYPES.includes(type)) fail(`Appointment type "${payload.type}" is not valid`, 422);

  const date = new Date(payload.appointmentDate);
  if (Number.isNaN(date.getTime())) fail("Appointment date is not valid", 422);

  const startMinutes = appointmentService.parseTime(payload.startTime);
  const durationMinutes = Number.parseInt(payload.durationMinutes, 10) || 30;
  if (durationMinutes < 5 || durationMinutes > 480) fail("Duration must be between 5 and 480 minutes", 422);

  if (endOfDay(date) < startOfDay(new Date())) fail("Appointment date cannot be in the past", 422);

  const { from, to } = dayBounds(date);
  await appointmentService.assertSlotFree({ doctorId, from, to, startMinutes, durationMinutes });
  await scheduleService.assertWithinAvailability({ doctorId, date, startMinutes, durationMinutes });

  const appointment = await withDuplicateRetry(async () =>
    Appointment.create({
      appointmentNo: await appointmentService.nextAppointmentNo(),
      patient: patient._id,
      doctor: doctor._id,
      appointmentDate: startOfDay(date),
      startMinutes,
      durationMinutes,
      type,
      status: "CONFIRMED",
      reason: payload.reason ? String(payload.reason).trim() : undefined,
    })
  );

  await auditService.record({
    action: "ADMIN_APPOINTMENT_CREATED",
    actor,
    targetType: "Appointment",
    targetId: appointment._id,
    targetEmail: patient.email,
    metadata: {
      appointmentNo: appointment.appointmentNo,
      doctorId: String(doctor._id),
      appointmentDate: appointment.appointmentDate,
      startMinutes,
      type,
    },
    req,
  });

  await notificationService.notifyUser({
    recipient: patient._id,
    type: "APPOINTMENT_BOOKED",
    title: "Appointment confirmed",
    message: `Your appointment ${appointment.appointmentNo} with ${doctor.name} is confirmed for ${startOfDay(date).toDateString()} at ${minutesToLabel(startMinutes)}.`,
    entityType: "Appointment",
    entityId: appointment._id,
  });

  await notificationService.notifyAdmins({
    type: "APPOINTMENT_BOOKED",
    title: "Appointment booked",
    message: `${appointment.appointmentNo} was booked for ${patient.name} with ${doctor.name}.`,
    entityType: "Appointment",
    entityId: appointment._id,
    preference: "appointmentAlerts",
  });

  return getOne(appointment._id);
};

/** Statuses an administrator may set directly, beyond the clinical flow. */
const ADMIN_TRANSITIONS = {
  SCHEDULED: ["CONFIRMED", "IN_CONSULTATION", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/**
 * Moves an appointment to a new date, time or doctor.
 *
 * The original slot is checked against every OTHER appointment, not against
 * itself - without `ignoreId` a doctor could never reschedule an appointment
 * without first cancelling it and losing the booking.
 */
const reschedule = async (appointmentId, payload, actor, req) => {
  const appointment = await Appointment.findById(objectId(appointmentId, "appointment id"));
  if (!appointment) fail("Appointment not found", 404);

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) {
    fail(`An appointment that is ${appointment.status.replace(/_/g, " ").toLowerCase()} cannot be rescheduled`, 409);
  }

  const doctorId = payload.doctorId ? objectId(payload.doctorId, "doctor id") : appointment.doctor;
  if (payload.doctorId) {
    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "APPROVED", isActive: true })
      .select("_id")
      .lean();
    if (!doctor) fail("Doctor not found or not available for booking", 404);
  }

  const date = payload.appointmentDate ? new Date(payload.appointmentDate) : appointment.appointmentDate;
  if (Number.isNaN(date.getTime())) fail("Appointment date is not valid", 422);

  const startMinutes =
    payload.startTime !== undefined && payload.startTime !== null && payload.startTime !== ""
      ? appointmentService.parseTime(payload.startTime)
      : appointment.startMinutes;

  const durationMinutes = Number.parseInt(payload.durationMinutes, 10) || appointment.durationMinutes || 30;

  if (endOfDay(date) < startOfDay(new Date())) fail("Appointment date cannot be in the past", 422);

  const previous = {
    doctor: appointment.doctor,
    appointmentDate: appointment.appointmentDate,
    startMinutes: appointment.startMinutes,
  };

  const { from, to } = dayBounds(date);
  await appointmentService.assertSlotFree({
    doctorId,
    from,
    to,
    startMinutes,
    durationMinutes,
    ignoreId: appointment._id,
  });
  await scheduleService.assertWithinAvailability({ doctorId, date, startMinutes, durationMinutes });

  appointment.doctor = doctorId;
  appointment.appointmentDate = startOfDay(date);
  appointment.startMinutes = startMinutes;
  appointment.durationMinutes = durationMinutes;
  if (payload.reason !== undefined) appointment.reason = String(payload.reason).trim();
  await appointment.save();

  await auditService.record({
    action: "ADMIN_APPOINTMENT_RESCHEDULED",
    actor,
    targetType: "Appointment",
    targetId: appointment._id,
    metadata: {
      appointmentNo: appointment.appointmentNo,
      from: {
        doctor: String(previous.doctor),
        date: previous.appointmentDate,
        startMinutes: previous.startMinutes,
      },
      to: { doctor: String(doctorId), date: appointment.appointmentDate, startMinutes },
    },
    req,
  });

  const [patient, doctor] = await Promise.all([
    User.findById(appointment.patient).select("name email").lean(),
    User.findById(doctorId).select("name email").lean(),
  ]);

  await notificationService.notifyUser({
    recipient: appointment.patient,
    type: "APPOINTMENT_RESCHEDULED",
    title: "Appointment rescheduled",
    message: `Your appointment ${appointment.appointmentNo} has moved to ${startOfDay(date).toDateString()} at ${minutesToLabel(startMinutes)} with ${doctor?.name || "your doctor"}.`,
    entityType: "Appointment",
    entityId: appointment._id,
  });

  await notificationService.notifyAdmins({
    type: "APPOINTMENT_RESCHEDULED",
    title: "Appointment rescheduled",
    message: `${appointment.appointmentNo} was moved to ${startOfDay(date).toDateString()} at ${minutesToLabel(startMinutes)}.`,
    entityType: "Appointment",
    entityId: appointment._id,
    preference: "appointmentAlerts",
  });

  return getOne(appointment._id);
};

/**
 * Cancels an appointment and tells both sides.
 *
 * An already-completed visit cannot be cancelled: the consultation and its
 * prescription exist, and deleting the appointment would orphan them.
 */
const cancel = async (appointmentId, reason, actor, req) => {
  const appointment = await Appointment.findById(objectId(appointmentId, "appointment id"));
  if (!appointment) fail("Appointment not found", 404);

  if (appointment.status === "COMPLETED") fail("A completed appointment cannot be cancelled", 409);
  if (appointment.status === "CANCELLED") fail("This appointment is already cancelled", 409);

  const previous = appointment.status;
  appointment.status = "CANCELLED";
  appointment.cancelledReason = String(reason || "").trim() || "Cancelled by administrator";
  await appointment.save();

  await auditService.record({
    action: "ADMIN_APPOINTMENT_CANCELLED",
    actor,
    targetType: "Appointment",
    targetId: appointment._id,
    metadata: { appointmentNo: appointment.appointmentNo, from: previous, to: "CANCELLED", reason: appointment.cancelledReason },
    req,
  });

  const [patient, doctor] = await Promise.all([
    User.findById(appointment.patient).select("name").lean(),
    User.findById(appointment.doctor).select("name email").lean(),
  ]);

  await Promise.all([
    notificationService.notifyUser({
      recipient: appointment.patient,
      type: "APPOINTMENT_CANCELLED",
      title: "Appointment cancelled",
      message: `Your appointment ${appointment.appointmentNo} on ${appointment.appointmentDate.toDateString()} was cancelled. Reason: ${appointment.cancelledReason}`,
      entityType: "Appointment",
      entityId: appointment._id,
    }),
    notificationService.notifyUser({
      recipient: appointment.doctor,
      type: "APPOINTMENT_CANCELLED",
      title: "Appointment cancelled",
      message: `Appointment ${appointment.appointmentNo} with ${patient?.name || "a patient"} was cancelled by the hospital administrator.`,
      entityType: "Appointment",
      entityId: appointment._id,
    }),
  ]);

  return getOne(appointment._id);
};

/** Direct status change (confirm, start, complete, no-show) for the queue. */
const updateStatus = async (appointmentId, nextStatus, actor, req) => {
  const appointment = await Appointment.findById(objectId(appointmentId, "appointment id"));
  if (!appointment) fail("Appointment not found", 404);

  const target = String(nextStatus || "").toUpperCase();
  if (!APPOINTMENT_STATUSES.includes(target)) fail(`Appointment status "${nextStatus}" is not valid`, 422);

  const allowed = ADMIN_TRANSITIONS[appointment.status] || [];
  if (!allowed.includes(target)) {
    fail(`An appointment that is ${appointment.status} cannot become ${target}`, 409);
  }

  const previous = appointment.status;
  appointment.status = target;
  if (target === "IN_CONSULTATION" && !appointment.startedAt) appointment.startedAt = new Date();
  if (target === "COMPLETED") appointment.completedAt = new Date();
  await appointment.save();

  await auditService.record({
    action: "ADMIN_APPOINTMENT_STATUS_CHANGED",
    actor,
    targetType: "Appointment",
    targetId: appointment._id,
    metadata: { appointmentNo: appointment.appointmentNo, from: previous, to: target },
    req,
  });

  return getOne(appointment._id);
};

/**
 * Today's waiting room (FR-AD-03), grouped by doctor.
 *
 * The estimated wait is a real calculation, not a number in a column: each
 * appointment's expected start is its own slot time or, when it queues behind an
 * over-running consultation, the previous patient's expected end. Walking the day
 * in slot order is the only way to know that the 09:30 with a 30-minute booking
 * before it starts late.
 */
const getQueue = async (dateInput) => {
  const { from, to } = dayBounds(dateInput);
  const rows = await Appointment.find({
    appointmentDate: { $gte: from, $lte: to },
    status: { $ne: "CANCELLED" },
  })
    .populate("patient", PATIENT_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .sort({ doctor: 1, startMinutes: 1 })
    .lean();

  const byDoctor = new Map();
  for (const row of rows) {
    const key = String(row.doctor?._id || row.doctor || "unassigned");
    if (!byDoctor.has(key)) byDoctor.set(key, []);
    byDoctor.get(key).push(row);
  }

  const now = Date.now();
  const doctors = [];

  for (const [doctorId, list] of byDoctor.entries()) {
    let cursorEnd = null;

    const entries = list.map((row, index) => {
      const duration = row.durationMinutes || 30;
      const scheduledEnd = row.startMinutes + duration;

      // An over-running earlier patient pushes this one back; a gap lets it start
      // on time.
      const expectedStart = cursorEnd && cursorEnd > row.startMinutes ? cursorEnd : row.startMinutes;
      cursorEnd = Math.max(expectedStart + duration, scheduledEnd);

      const expectedStartAt = from.getTime() + expectedStart * 60000;
      const waitMinutes = Math.max(0, Math.round((expectedStartAt - now) / 60000));

      return {
        ...present(row),
        sequence: index + 1,
        expectedStartMinutes: expectedStart,
        expectedStartTime: minutesToLabel(expectedStart),
        waitMinutes,
        runningLate: expectedStart > row.startMinutes,
      };
    });

    doctors.push({
      doctor: entries[0].doctor,
      total: entries.length,
      waiting: entries.filter((entry) => ["SCHEDULED", "CONFIRMED"].includes(entry.status)).length,
      inConsultation: entries.filter((entry) => entry.status === "IN_CONSULTATION").length,
      completed: entries.filter((entry) => entry.status === "COMPLETED").length,
      noShow: entries.filter((entry) => entry.status === "NO_SHOW").length,
      longestWaitMinutes: entries.reduce((max, entry) => Math.max(max, entry.waitMinutes), 0),
      appointments: entries,
    });
  }

  return {
    date: from,
    doctors: doctors.sort((a, b) => a.doctor?.name?.localeCompare(b.doctor?.name || "") || 0),
    totals: {
      appointments: rows.length,
      waiting: doctors.reduce((sum, entry) => sum + entry.waiting, 0),
      inConsultation: doctors.reduce((sum, entry) => sum + entry.inConsultation, 0),
      completed: doctors.reduce((sum, entry) => sum + entry.completed, 0),
    },
  };
};

/** Small helper shared by the queue and the reports: status counts for a window. */
const statusCounts = async (from, to) => {
  const rows = await Appointment.aggregate([
    { $match: { appointmentDate: { $gte: from, $lte: to } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
};

module.exports = {
  list,
  getOne,
  create,
  reschedule,
  cancel,
  updateStatus,
  getQueue,
  statusCounts,
  present,
  buildFilter,
  dayBounds,
  startOfDay,
  endOfDay,
  minutesToLabel,
  round,
  PATIENT_FIELDS,
  DOCTOR_FIELDS,
  ADMIN_TRANSITIONS,
};