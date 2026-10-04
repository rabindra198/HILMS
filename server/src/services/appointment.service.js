const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const User = require("../models/User");
const auditService = require("./audit.service");
const careTeamService = require("./careTeam.service");
const notificationService = require("./notification.service");
const scheduleService = require("./schedule.service");
const { nextSequence, highestExistingSequence, withDuplicateRetry } = require("../utils/sequence");

/**
 * Appointments for the doctor module.
 *
 * A follow-up is NOT a separate table: it is an Appointment with
 * `type: "FOLLOW_UP"` and `followUpOf` pointing at the consultation that
 * recommended it. That is what lets the medical-history timeline walk
 * consultation -> follow-up -> next consultation without a bespoke join table.
 *
 * Booking always goes through the care-team check, so a doctor cannot book
 * themselves an appointment with a patient they are not assigned to.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const PATIENT_FIELDS = "name email phone contactNumber address";
const DOCTOR_FIELDS = "name email nmcNumber";

/** 570 -> "09:30". Mirrors the helper the admin and schedule services use. */
const minutesToLabel = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "09:30" or 570 -> 570. Rejects anything outside a single day. */
const parseTime = (value) => {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value < 0 || value > 1439) fail("Start time must be within a single day", 422);
    return value;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) fail("Start time must look like HH:MM", 422);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) fail("Start time must be within a single day", 422);
  return hours * 60 + minutes;
};

const startOfDay = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * The empty result for a list, in the SAME `{ items, pagination }` shape the
 * populated path returns.
 *
 * An early `return []` here used to leave the controller destructuring
 * `{ items, pagination }` off an array, so the client received `data: undefined`
 * - a crash in the UI that only reproduced for a doctor with an empty day.
 */
const emptyPage = (limit = 50, page = 1) => ({
  items: [],
  pagination: { page, limit, total: 0, totalPages: 1 },
});

const endOfDay = (date) => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

/** Midnight-to-midnight bounds for a `YYYY-MM-DD` string, parsed as local time. */
const dayBounds = (dateInput) => {
  if (!dateInput) {
    const now = new Date();
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) fail("Date is not valid", 422);
  return { from: startOfDay(parsed), to: endOfDay(parsed) };
};

const nextAppointmentNo = () =>
  nextSequence(
    `appointmentNo:${new Date().getFullYear()}`,
    () => highestExistingSequence(Appointment, "appointmentNo", `APT-${new Date().getFullYear()}-`)
  ).then((seq) => `APT-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`);

const nextConsultationNo = () =>
  nextSequence(
    `consultationNo:${new Date().getFullYear()}`,
    () =>
      highestExistingSequence(
        Consultation,
        "consultationNo",
        `CON-${new Date().getFullYear()}-`
      )
  ).then((seq) => `CON-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`);

/**
 * A doctor cannot be double-booked in the same slot. Overlap is checked against
 * the existing appointment's duration, not just its start time, so a 60-minute
 * booking does not collide with a 09:30 that starts inside it.
 */
const assertSlotFree = async ({ doctorId, from, to, startMinutes, durationMinutes, ignoreId }) => {
  const filter = {
    doctor: doctorId,
    status: { $nin: ["CANCELLED"] },
    appointmentDate: { $gte: from, $lte: to },
  };
  if (ignoreId) filter._id = { $ne: ignoreId };

  const sameDay = await Appointment.find(filter).select("startMinutes durationMinutes appointmentNo");

  const clash = sameDay.find((existing) => {
    const existingStart = existing.startMinutes;
    const existingEnd = existingStart + (existing.durationMinutes || 30);
    return startMinutes < existingEnd && existingStart < startMinutes + durationMinutes;
  });

  if (clash) {
    fail(`That time is already booked (${clash.appointmentNo})`, 409);
  }
};

/** Lists a doctor's appointments, filtered and paginated. */
const list = async (doctorId, query = {}) => {
  const filter = { doctor: doctorId };
  const { from, to } = dayBounds(query.date);

  switch (query.scope) {
    case "today":
      filter.appointmentDate = { $gte: from, $lte: to };
      break;
    case "upcoming":
      filter.appointmentDate = { $gte: startOfDay(new Date()) };
      break;
    case "past":
      filter.appointmentDate = { $lte: endOfDay(new Date(Date.now() - 86400000)) };
      break;
    case "completed":
      filter.status = "COMPLETED";
      break;
    case "cancelled":
      filter.status = "CANCELLED";
      break;
    default:
      break;
  }

  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;

  // Only ever consider patients this doctor is assigned to; an assignment
  // revoked after the booking was made must not leave the record reachable.
  // This is an authorization filter and is applied UNCONDITIONALLY, before the
  // search clause below gets any chance to widen it.
  const patientIds = await careTeamService.assignedPatientIds(doctorId);
  if (!patientIds.length) return emptyPage();

  filter.patient = { $in: patientIds };

  // "Show me this patient's appointments" deep link (Consultations and the patient
  // record both link here with ?patient=<id>). The requested id is INTERSECTED
  // with the assigned set rather than replacing it, so the care-team ceiling above
  // still holds: asking for a patient the doctor is not assigned to yields an empty
  // list rather than someone else's appointments. A bare `$in` of the raw id would
  // be an IDOR.
  if (query.patient) {
    const requested = String(query.patient);
    const permitted = patientIds.filter((allowed) => String(allowed) === requested);
    filter.patient = { $in: permitted };
  }

  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  if (query.search) {
    // Escape the input: an unescaped regex from a search box is a ReDoS and an
    // enumeration vector.
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    const matched = await User.find({
      _id: { $in: patientIds },
      $or: [{ name: regex }, { email: regex }],
    })
      .select("_id")
      .lean();

    // A doctor looks for an appointment by patient name, by the reason they
    // wrote, or by the appointment number, and all three belong in this one
    // list. All three stay inside the assigned-patient ceiling above, so
    // searching for a stranger's reason cannot reveal their appointment.
    filter.$or = [
      { patient: { $in: matched.map((row) => row._id) } },
      { reason: regex },
      { appointmentNo: regex },
    ];
  }

  const [items, total] = await Promise.all([
    Appointment.find(filter)
      .populate("patient", PATIENT_FIELDS)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ appointmentDate: 1, startMinutes: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getOne = async (doctorId, appointmentId) => {
  const appointment = await Appointment.findOne({ _id: appointmentId, doctor: doctorId })
    .populate("patient", PATIENT_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .lean();

  if (!appointment) fail("Appointment not found", 404);

  // The doctor owns the row, but the patient must still be in their care team.
  await careTeamService.assertAccess(doctorId, appointment.patient._id || appointment.patient);

  return appointment;
};

/** Books an appointment. Used for first visits and for follow-ups. */
const book = async (payload, doctorId, actor) => {
  const {
    patient,
    appointmentDate,
    startTime,
    durationMinutes,
    type,
    reason,
    followUpOf,
  } = payload;

  // Care-team gate: without this a doctor could book any patient in the system.
  const { patient: patientDoc } = await careTeamService.assertAccess(doctorId, patient);

  const startMinutes = parseTime(startTime);
  const duration = Number.parseInt(durationMinutes, 10) || 30;
  const appointmentType = (type || "CONSULTATION").toUpperCase();

  if (!Appointment.APPOINTMENT_TYPES.includes(appointmentType)) {
    fail("Appointment type is not valid", 422);
  }

  const date = new Date(appointmentDate);
  if (Number.isNaN(date.getTime())) fail("Appointment date is not valid", 422);
  if (endOfDay(date) < startOfDay(new Date()) && !payload.allowPast) {
    fail("Appointment date cannot be in the past", 422);
  }

  let parentConsultation = null;
  if (appointmentType === "FOLLOW_UP") {
    // A follow-up must point at one of this doctor's own consultations,
    // otherwise the history chain is forgeable.
    if (!followUpOf) fail("A follow-up must reference the consultation it follows", 422);
    parentConsultation = await Consultation.findOne({
      _id: followUpOf,
      doctor: doctorId,
      patient: patientDoc._id,
    }).select("_id consultationNo");
    if (!parentConsultation) fail("The consultation being followed up was not found", 404);
  }

  const { from, to } = dayBounds(date);
  await assertSlotFree({ doctorId, from, to, startMinutes, durationMinutes: duration });

  // A doctor's own booking is checked against their published hours only once an
  // Admin has actually set a schedule for them. Before this existed there was no
  // schedule at all, so enforcing the 09:00-17:00 fallback here would start
  // rejecting follow-ups that were legitimately booked outside it.
  if (await scheduleService.hasStoredSchedule(doctorId)) {
    await scheduleService.assertWithinAvailability({
      doctorId,
      date,
      startMinutes,
      durationMinutes: duration,
    });
  }

  const appointment = await withDuplicateRetry(async () => {
    const created = await Appointment.create({
      appointmentNo: await nextAppointmentNo(),
      patient: patientDoc._id,
      doctor: doctorId,
      appointmentDate: startOfDay(date),
      startMinutes,
      durationMinutes: duration,
      type: appointmentType,
      status: "SCHEDULED",
      reason,
      followUpOf: parentConsultation?._id,
    });
    return created;
  });

  await auditService.record({
    action: appointmentType === "FOLLOW_UP" ? "FOLLOW_UP_SCHEDULED" : "APPOINTMENT_BOOKED",
    actor: actor || { _id: doctorId },
    targetType: "Appointment",
    targetId: appointment._id,
    targetEmail: patientDoc.email,
    metadata: {
      appointmentNo: appointment.appointmentNo,
      type: appointmentType,
      followUpOf: parentConsultation?.consultationNo || null,
    },
  });

  // FR-DR-01: the patient must be told when their own visit is booked. Admin-side
  // booking already notified; a doctor booking directly did not, so the same action
  // produced a notification or not depending on who clicked. Best-effort, so a
  // notification problem never loses an already-committed booking.
  notificationService
    .notifyUser({
      recipient: patientDoc._id,
      type: "APPOINTMENT_BOOKED",
      title: "Appointment booked",
      message: `Your appointment ${appointment.appointmentNo} is booked for ${appointment.appointmentDate.toDateString()} at ${minutesToLabel(startMinutes)}.`,
      entityType: "Appointment",
      entityId: appointment._id,
    })
    .catch(() => {});

  return appointment.populate("patient", PATIENT_FIELDS);
};

/**
 * Status changes a Doctor is allowed to make. This deliberately excludes
 * booking-for-other-doctors and admin-only account actions.
 */
const DOCTOR_ALLOWED_TRANSITIONS = {
  SCHEDULED: ["CONFIRMED", "IN_CONSULTATION", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["IN_CONSULTATION", "CANCELLED", "NO_SHOW"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const updateStatus = async (appointmentId, doctorId, nextStatus, actor) => {
  const appointment = await Appointment.findOne({ _id: appointmentId, doctor: doctorId });
  if (!appointment) fail("Appointment not found", 404);

  // Owning the row is not enough: the patient must still be in this doctor's care
  // team. Without this check an Admin who REVOKES an assignment leaves the doctor
  // able to keep completing and cancelling that patient's appointments, which is
  // exactly the access the revocation was meant to remove.
  await careTeamService.assertAccess(doctorId, appointment.patient);

  const target = String(nextStatus || "").toUpperCase();
  const previous = appointment.status;
  const allowed = DOCTOR_ALLOWED_TRANSITIONS[previous] || [];

  if (!allowed.includes(target)) {
    fail(`An appointment that is ${previous} cannot become ${target}`, 409);
  }

  appointment.status = target;
  if (target === "IN_CONSULTATION" && !appointment.startedAt) appointment.startedAt = new Date();
  if (target === "COMPLETED") appointment.completedAt = new Date();
  await appointment.save();

  await auditService.record({
    action: "APPOINTMENT_STATUS_CHANGED",
    actor: actor || { _id: doctorId },
    targetType: "Appointment",
    targetId: appointment._id,
    metadata: { appointmentNo: appointment.appointmentNo, from: previous, to: target },
  });

  // The patient is the other half of a status change they did not initiate, so they
  // are told when a doctor confirms, cancels or otherwise moves their visit. Only the
  // states the patient actually cares about: IN_CONSULTATION is the doctor working,
  // which is not news for the patient.
  if (["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(target)) {
    notificationService
      .notifyUser({
        recipient: appointment.patient,
        type: target === "CANCELLED" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_STATUS_CHANGED",
        title: target === "CANCELLED" ? "Appointment cancelled" : "Appointment updated",
        message: `Your appointment ${appointment.appointmentNo} is now ${target.toLowerCase().replace(/_/g, " ")}.`,
        entityType: "Appointment",
        entityId: appointment._id,
      })
      .catch(() => {});
  }

  return appointment;
};

/**
 * Closes an appointment as a side effect of completing its consultation.
 *
 * A consultation can be completed from any of SCHEDULED / CONFIRMED /
 * IN_CONSULTATION, but DOCTOR_ALLOWED_TRANSITIONS only permits COMPLETED from
 * IN_CONSULTATION. Rather than silently leaving the appointment open, this walks
 * the legal path and records each hop, so the day's list and the consultation
 * record can never disagree.
 */
const completeForConsultation = async (appointmentId, doctorId, actor) => {
  let appointment = await Appointment.findOne({ _id: appointmentId, doctor: doctorId });
  if (!appointment) return null;

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) return appointment;

  if (appointment.status !== "IN_CONSULTATION") {
    await updateStatus(appointmentId, doctorId, "IN_CONSULTATION", actor);
  }
  return updateStatus(appointmentId, doctorId, "COMPLETED", actor);
};

/**
 * Patient self-service surface.
 *
 * These three functions exist because the patient module must never route through
 * `assertAccess`: a patient is not on anybody's `DoctorPatientAssignment`, so
 * there is no doctor->patient row to check. The patient's identity instead comes
 * from the verified session (the controller passes `req.user`), and every read is
 * filtered by `{ patient: <session id> }` so the database, not the client, decides
 * what this caller may see.
 *
 * Clinic hours are NOT decided here. `schedule.service` owns them, and this
 * module asks it - so the hours an Admin publishes, the slots a patient is shown
 * and the rule a booking is validated against are one calculation. The two
 * constants below are only the fallbacks used before a schedule exists.
 */
const SLOT_MINUTES = 30;
const PATIENT_CANCELLABLE = ["SCHEDULED", "CONFIRMED"];

/** A slot is bookable only if its start time is still in the future. */
const slotIsPast = (day, startMinutes) => startOfDay(day).getTime() + startMinutes * 60000 <= Date.now();

/**
 * Patient self-booking. Reuses the same numbering, slot-conflict check and
 * validation as the doctor-initiated `book`; the only difference is that the
 * patient is taken from the session instead of a care-team lookup.
 */
const bookForPatient = async (payload, patientDoc, actor) => {
  const { doctorId, appointmentDate, startTime, durationMinutes, type, reason } = payload;

  const doctor = await User.findOne({
    _id: doctorId,
    role: "doctor",
    status: "APPROVED",
    isActive: true,
  })
    .select("_id name email nmcNumber department")
    .lean();
  if (!doctor) fail("The selected doctor is not available for booking", 404);

  // A patient books a consultation. Follow-ups are created by the doctor as part
  // of a consultation, so accepting that type here would forge the history chain.
  const appointmentType = (type || "CONSULTATION").toUpperCase();
  if (appointmentType !== "CONSULTATION") {
    fail("Patients can only request consultation appointments", 422);
  }

  const date = new Date(appointmentDate);
  if (Number.isNaN(date.getTime())) fail("Appointment date is not valid", 422);

  const startMinutes = parseTime(startTime);
  const duration = Number.parseInt(durationMinutes, 10) || SLOT_MINUTES;

  const { from, to } = dayBounds(date);
  if (from < startOfDay(new Date())) fail("Appointment date cannot be in the past", 422);
  if (slotIsPast(date, startMinutes)) fail("That time has already passed today. Please choose a later slot.", 422);

  // The hours a patient is shown come from `schedule.service`, so the promise on
  // the booking screen and the rule enforced here cannot disagree. A doctor with
  // no published schedule keeps the previous 09:00-17:00 clinic window.
  await scheduleService.assertWithinAvailability({ doctorId, date, startMinutes, durationMinutes: duration });

  await assertSlotFree({ doctorId, from, to, startMinutes, durationMinutes: duration });

  const appointment = await withDuplicateRetry(async () =>
    Appointment.create({
      appointmentNo: await nextAppointmentNo(),
      patient: patientDoc._id,
      doctor: doctor._id,
      appointmentDate: startOfDay(date),
      startMinutes,
      durationMinutes: duration,
      type: appointmentType,
      status: "SCHEDULED",
      reason,
    })
  );

  await auditService.record({
    action: "PATIENT_APPOINTMENT_BOOKED",
    actor: actor || { _id: patientDoc._id },
    targetType: "Appointment",
    targetId: appointment._id,
    targetEmail: patientDoc.email,
    metadata: { appointmentNo: appointment.appointmentNo, doctorEmail: doctor.email },
  });

  return appointment.populate("doctor", DOCTOR_FIELDS);
};

/**
 * Patient-initiated cancellation, scoped by ownership in the query itself.
 *
 * Only SCHEDULED / CONFIRMED may be cancelled: once a consultation has started the
 * clinical record exists and cancelling it would orphan that work.
 */
const cancelByPatient = async (appointmentId, patientId, reason) => {
  const appointment = await Appointment.findOne({ _id: appointmentId, patient: patientId });
  if (!appointment) fail("Appointment not found", 404);

  const previous = appointment.status;
  if (!PATIENT_CANCELLABLE.includes(previous)) {
    fail(
      `This appointment is ${previous.replace(/_/g, " ").toLowerCase()} and can no longer be cancelled`,
      409
    );
  }

  appointment.status = "CANCELLED";
  appointment.cancelledReason = String(reason || "Cancelled by patient").slice(0, 300);
  await appointment.save();

  await auditService.record({
    action: "PATIENT_APPOINTMENT_CANCELLED",
    actor: { _id: patientId },
    targetType: "Appointment",
    targetId: appointment._id,
    metadata: { appointmentNo: appointment.appointmentNo, from: previous, to: "CANCELLED" },
  });

  return appointment;
};

/**
 * Bookable slots for one doctor on one day.
 *
 * This delegates to `schedule.service` so the slot grid a patient sees, the
 * availability an Admin edits and the rule the booking path enforces are all the
 * same calculation. It previously re-derived a flat 09:00-17:00 window here,
 * which is why an Admin editing availability had no effect on real bookings.
 */
const listAvailability = async ({ doctorId, date, durationMinutes }) =>
  scheduleService.buildAvailability({ doctorId, date, durationMinutes });

module.exports = {
  list,
  getOne,
  book,
  bookForPatient,
  cancelByPatient,
  listAvailability,
  updateStatus,
  completeForConsultation,
  assertSlotFree,
  parseTime,
  nextAppointmentNo,
  dayBounds,
  startOfDay,
  endOfDay,
  nextConsultationNo,
  DOCTOR_ALLOWED_TRANSITIONS,
  SLOT_MINUTES,
  PATIENT_FIELDS,
  DOCTOR_FIELDS,
};
