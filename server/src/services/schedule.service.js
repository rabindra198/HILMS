const DoctorSchedule = require("../models/DoctorSchedule");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const auditService = require("./audit.service");

/**
 * Doctor availability - the single source of truth for "when may this doctor be
 * booked?".
 *
 * WHY this is its own service rather than a controller helper: the answer is
 * needed by three unrelated callers - the Admin availability editor, the patient
 * booking screen and every write path that creates or moves an appointment. If
 * those three derived their own hours they would drift, and the Admin would be
 * editing a screen that does not constrain the actual booking. They all call in
 * here instead.
 *
 * A doctor with no `DoctorSchedule` rows keeps the historical 09:00-17:00 window
 * so existing accounts and existing appointments remain valid without a migration.
 * Once a doctor has ANY row, the stored schedule is authoritative - including a
 * weekday whose only rows are inactive, which means "closed that day" rather than
 * "fall back to the default".
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

/** The window a doctor gets before an Admin has published a schedule for them. */
const DEFAULT_WINDOW = { startMinutes: 9 * 60, endMinutes: 17 * 60, slotMinutes: 30 };

const WEEKDAY_LABELS = Object.freeze([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

const minutesToLabel = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "09:30" -> 570. Accepts minutes-as-a-number so an API caller may send either. */
const labelToMinutes = (value, field) => {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value < 0 || value > 1440) fail(`${field} must fall inside a single day`, 422);
    return value;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) fail(`${field} must look like HH:MM`, 422);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) fail(`${field} must fall inside a single day`, 422);
  return hours * 60 + minutes;
};

const startOfDay = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/** A slot is bookable only while it is still in the future. */
const slotIsPast = (day, startMinutes) => startOfDay(day).getTime() + startMinutes * 60000 <= Date.now();

/** Shape one stored window for the API, adding the labels the UI renders. */
const presentWindow = (row) => {
  const source = typeof row.toObject === "function" ? row.toObject() : row;
  return {
    _id: source._id,
    doctor: source.doctor,
    weekday: source.weekday,
    weekdayLabel: WEEKDAY_LABELS[source.weekday],
    startMinutes: source.startMinutes,
    endMinutes: source.endMinutes,
    startTime: minutesToLabel(source.startMinutes),
    endTime: minutesToLabel(source.endMinutes),
    slotMinutes: source.slotMinutes,
    isActive: source.isActive !== false,
  };
};

/**
 * Validates one window coming from a request body.
 * Returns the exact fields written to the database - never the raw body, so a
 * caller cannot smuggle `_id`, `doctor` or `createdAt` through.
 */
const normaliseWindow = (body) => {
  const weekday = Number.parseInt(body.weekday, 10);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    fail("Weekday must be a whole number between 0 (Sunday) and 6 (Saturday)", 422);
  }

  const startMinutes = labelToMinutes(body.startTime ?? body.startMinutes, "Start time");
  const endMinutes = labelToMinutes(body.endTime ?? body.endMinutes, "End time");

  if (endMinutes <= startMinutes) fail("End time must be later than the start time", 422);

  const slotMinutes = Number.parseInt(body.slotMinutes, 10) || DEFAULT_WINDOW.slotMinutes;
  if (slotMinutes < 5 || slotMinutes > 240) fail("Slot length must be between 5 and 240 minutes", 422);
  if (slotMinutes > endMinutes - startMinutes) {
    fail("Slot length cannot be longer than the window itself", 422);
  }

  return {
    weekday,
    startMinutes,
    endMinutes,
    slotMinutes,
    isActive: body.isActive !== false,
  };
};

/** Confirms the id really is a doctor before a schedule is written for them. */
const assertDoctor = async (doctorId) => {
  const doctor = await User.findOne({ _id: doctorId, role: "doctor" }).select("_id name email").lean();
  if (!doctor) fail("Doctor not found", 404);
  return doctor;
};

/** Every window stored for a doctor, grouped order for display. */
const listForDoctor = async (doctorId) => {
  const rows = await DoctorSchedule.find({ doctor: doctorId })
    .sort({ weekday: 1, startMinutes: 1 })
    .lean();
  return rows.map(presentWindow);
};

/** Windows for every doctor, for the Admin availability overview grid. */
const listForDoctors = async (doctorIds) => {
  if (!doctorIds.length) return new Map();
  const rows = await DoctorSchedule.find({ doctor: { $in: doctorIds } })
    .sort({ doctor: 1, weekday: 1, startMinutes: 1 })
    .lean();

  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.doctor);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(presentWindow(row));
  }
  return grouped;
};

/**
 * Resolves the bookable windows for one doctor on one calendar date.
 *
 * `usingDefault` tells the caller whether the doctor's real schedule was
 * consulted or the built-in fallback was, so the Admin UI can say so honestly
 * instead of implying an Admin published 09:00-17:00.
 */
const windowsForDate = async (doctorId, date) => {
  const weekday = startOfDay(date).getDay();
  const rows = await DoctorSchedule.find({ doctor: doctorId, weekday }).sort({ startMinutes: 1 }).lean();

  if (!rows.length) {
    // No row for this weekday. Distinguish "this doctor has no schedule at all"
    // (fall back to the default hours) from "this doctor has a schedule and is
    // closed on this weekday" (closed - do NOT re-open them).
    const hasAny = await DoctorSchedule.exists({ doctor: doctorId });
    if (!hasAny) {
      return { windows: [{ ...DEFAULT_WINDOW, weekday, isActive: true }], usingDefault: true, closed: false };
    }
    return { windows: [], usingDefault: false, closed: true };
  }

  return {
    windows: rows.filter((row) => row.isActive !== false).map((row) => ({ ...row, weekday })),
    usingDefault: false,
    closed: false,
  };
};

/** A readable description of a doctor's hours for that day, for error messages. */
const describeHours = (windows) => {
  if (!windows.length) return "the doctor is not available on that day";
  return windows.map((window) => `${minutesToLabel(window.startMinutes)} to ${minutesToLabel(window.endMinutes)}`).join(" and ");
};

/**
 * Whether an Admin has ever published a schedule for this doctor.
 *
 * Callers use this to distinguish "the doctor has real hours and this slot is
 * outside them" (a 422) from "the doctor has no schedule at all" (leave the
 * existing permissive behaviour alone). Without that distinction, adding the
 * availability gate would silently start rejecting bookings that worked before.
 */
const hasStoredSchedule = async (doctorId) => Boolean(await DoctorSchedule.exists({ doctor: doctorId }));

/**
 * The single gate every appointment write passes through.
 *
 * Throws 422 with the doctor's real hours when the requested slot falls outside
 * them, or when the day is closed. `assertSlotFree` still runs afterwards - this
 * only answers "is the clinic open?", not "is somebody already in that seat?".
 */
const assertWithinAvailability = async ({ doctorId, date, startMinutes, durationMinutes }) => {
  const { windows, usingDefault, closed } = await windowsForDate(doctorId, date);
  const duration = Number(durationMinutes) || 30;

  if (closed || !windows.length) {
    fail(`The doctor is not available on ${WEEKDAY_LABELS[startOfDay(date).getDay()]}.`, 422);
  }

  const fits = windows.some(
    (window) => startMinutes >= window.startMinutes && startMinutes + duration <= window.endMinutes
  );

  if (!fits) {
    // The fallback case has to name the hours too - "Clinic hours are" on its
    // own tells the person booking nothing about when to move the appointment.
    const hours = describeHours(windows);
    const suffix = ` on ${WEEKDAY_LABELS[startOfDay(date).getDay()]}.`;
    fail(
      usingDefault
        ? `Clinic hours are ${hours}${suffix} This doctor has no published schedule yet, so the default clinic hours apply.`
        : `The doctor is available ${hours}${suffix}`,
      422
    );
  }

  return true;
};

/**
 * Bookable slots for one doctor on one day.
 *
 * Combines the doctor's published windows with the appointments that already
 * exist, so a slot taken in any module is reported as unavailable here. This is
 * the one function the patient booking screen and the Admin availability editor
 * both read, which is what keeps the two in agreement.
 */
const buildAvailability = async ({ doctorId, date, durationMinutes }) => {
  const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "APPROVED", isActive: true })
    .select("_id name email department consultationFee")
    .lean();
  if (!doctor) fail("Doctor not found", 404);

  const target = new Date(date);
  if (Number.isNaN(target.getTime())) fail("Date is not valid", 422);

  const requestedDuration = Number.parseInt(durationMinutes, 10);
  const { windows, usingDefault } = await windowsForDate(doctorId, target);

  const booked = await Appointment.find({
    doctor: doctorId,
    status: { $nin: ["CANCELLED", "NO_SHOW"] },
    appointmentDate: {
      $gte: startOfDay(target),
      $lte: startOfDay(new Date(target.getTime() + 86400000 - 1)),
    },
  })
    .select("startMinutes durationMinutes appointmentNo status")
    .lean();

  const slots = [];
  for (const window of windows) {
    const step = window.slotMinutes || DEFAULT_WINDOW.slotMinutes;
    const duration = requestedDuration || step;

    for (let start = window.startMinutes; start + duration <= window.endMinutes; start += step) {
      const clash = booked.find((row) => {
        const rowStart = row.startMinutes;
        const rowEnd = rowStart + (row.durationMinutes || step);
        return start < rowEnd && rowStart < start + duration;
      });
      const isPast = slotIsPast(target, start);

      slots.push({
        startMinutes: start,
        startTime: minutesToLabel(start),
        endTime: minutesToLabel(start + duration),
        durationMinutes: duration,
        available: !clash && !isPast,
        booked: Boolean(clash),
        bookedBy: clash ? clash.appointmentNo : null,
        past: isPast,
      });
    }
  }

  return {
    doctor,
    date: target,
    weekdayLabel: WEEKDAY_LABELS[target.getDay()],
    usingDefaultSchedule: usingDefault,
    clinicHours: windows.length
      ? {
          startTime: minutesToLabel(Math.min(...windows.map((window) => window.startMinutes))),
          endTime: minutesToLabel(Math.max(...windows.map((window) => window.endMinutes))),
        }
      : null,
    windows: windows.map((window) => ({
      startTime: minutesToLabel(window.startMinutes),
      endTime: minutesToLabel(window.endMinutes),
      slotMinutes: window.slotMinutes || DEFAULT_WINDOW.slotMinutes,
    })),
    slots,
  };
};

/** Adds one window to a doctor's schedule. */
const addWindow = async (doctorId, body, actor, req) => {
  await assertDoctor(doctorId);
  const window = normaliseWindow(body);

  const created = await DoctorSchedule.create({ ...window, doctor: doctorId });

  await auditService.record({
    action: "DOCTOR_SCHEDULE_ADDED",
    actor,
    targetType: "DoctorSchedule",
    targetId: created._id,
    targetEmail: actor?.email,
    metadata: {
      doctor: String(doctorId),
      weekday: WEEKDAY_LABELS[window.weekday],
      hours: `${minutesToLabel(window.startMinutes)}-${minutesToLabel(window.endMinutes)}`,
    },
    req,
  });

  return presentWindow(created);
};

/** Edits one existing window in place, scoped to the doctor that owns it. */
const updateWindow = async (doctorId, windowId, body, actor, req) => {
  const existing = await DoctorSchedule.findOne({ _id: windowId, doctor: doctorId });
  if (!existing) fail("Availability window not found", 404);

  const window = normaliseWindow({ ...presentWindow(existing), ...body });
  Object.assign(existing, window);
  await existing.save();

  await auditService.record({
    action: "DOCTOR_SCHEDULE_UPDATED",
    actor,
    targetType: "DoctorSchedule",
    targetId: existing._id,
    metadata: {
      doctor: String(doctorId),
      weekday: WEEKDAY_LABELS[window.weekday],
      hours: `${minutesToLabel(window.startMinutes)}-${minutesToLabel(window.endMinutes)}`,
    },
    req,
  });

  return presentWindow(existing);
};

/**
 * Removes a window.
 *
 * Refuses while the window still holds booked appointments in the future, because
 * deleting it would silently invalidate a booking the patient can see. The Admin
 * must cancel or move those appointments first - the queue and the appointment
 * list give them both routes.
 */
/**
 * Upcoming bookings that the given window set would leave uncovered.
 *
 * A recurring window has to be checked against every future occurrence of its
 * weekday, not against "does this doctor have any appointments at all": deleting
 * one Tuesday window must not be refused because of a Friday booking, and saving
 * a week must not silently strand a patient who already holds a slot.
 *
 * Returns the offending appointments, oldest first, so the caller can name them.
 */
const bookingsOutsideWindows = async (doctorId, windows) => {
  const upcoming = await Appointment.find({
    doctor: doctorId,
    status: { $nin: ["CANCELLED", "NO_SHOW"] },
    appointmentDate: { $gte: startOfDay(new Date()) },
  })
    .select("appointmentNo appointmentDate startMinutes durationMinutes")
    .lean();

  const active = (windows || []).filter((window) => window.isActive !== false);

  return upcoming.filter((appointment) => {
    const weekday = new Date(appointment.appointmentDate).getDay();
    const start = appointment.startMinutes;
    const end = start + (appointment.durationMinutes || DEFAULT_WINDOW.slotMinutes);
    return !active.some(
      (window) =>
        window.weekday === weekday && start >= window.startMinutes && end <= window.endMinutes
    );
  });
};

const describeBookings = (bookings) =>
  bookings
    .slice(0, 3)
    .map((booking) => `${booking.appointmentNo} on ${startOfDay(booking.appointmentDate).toDateString()} at ${minutesToLabel(booking.startMinutes)}`)
    .join(", ") + (bookings.length > 3 ? `, and ${bookings.length - 3} more` : "");

const removeWindow = async (doctorId, windowId, actor, req) => {
  const existing = await DoctorSchedule.findOne({ _id: windowId, doctor: doctorId });
  if (!existing) fail("Availability window not found", 404);

  // Only bookings that this window actually covers matter - an unrelated booking
  // elsewhere in the week must not block the deletion.
  const stranded = await bookingsOutsideWindows(doctorId, [
    { weekday: existing.weekday, startMinutes: existing.startMinutes, endMinutes: existing.endMinutes, isActive: true },
  ]);

  if (stranded.length) {
    fail(
      `Removing this window would strand ${stranded.length} booked appointment(s): ${describeBookings(stranded)}. Move or cancel them first.`,
      409
    );
  }

  await existing.deleteOne();

  await auditService.record({
    action: "DOCTOR_SCHEDULE_REMOVED",
    actor,
    targetType: "DoctorSchedule",
    targetId: windowId,
    metadata: {
      doctor: String(doctorId),
      weekday: WEEKDAY_LABELS[existing.weekday],
      hours: `${minutesToLabel(existing.startMinutes)}-${minutesToLabel(existing.endMinutes)}`,
    },
    req,
  });

  return { removed: true };
};

/**
 * Replaces a doctor's whole schedule in one write.
 *
 * The Admin availability screen edits seven days at once; sending that as seven
 * separate requests would leave a half-applied schedule if one were rejected.
 * The whole set is validated before anything is written.
 */
const replaceForDoctor = async (doctorId, windows, actor, req) => {
  await assertDoctor(doctorId);

  const list = Array.isArray(windows) ? windows : [];
  const normalised = list.map((window) => normaliseWindow(window));

  for (let i = 0; i < normalised.length; i += 1) {
    for (let j = i + 1; j < normalised.length; j += 1) {
      const a = normalised[i];
      const b = normalised[j];
      if (a.weekday !== b.weekday) continue;
      const overlap = a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
      if (overlap) {
        fail(`Two windows overlap on ${WEEKDAY_LABELS[a.weekday]}`, 422);
      }
    }
  }

  // The whole set is validated before anything is written, including that no
  // already-booked appointment would be left outside the new hours.
  const stranded = await bookingsOutsideWindows(doctorId, normalised);
  if (stranded.length) {
    fail(
      `This schedule would strand ${stranded.length} booked appointment(s) that fall outside the new hours: ${describeBookings(stranded)}. Move or cancel them first.`,
      409
    );
  }

  const previous = await DoctorSchedule.find({ doctor: doctorId }).select("_id");
  await DoctorSchedule.deleteMany({ doctor: doctorId });

  const created = await DoctorSchedule.insertMany(
    normalised.map((window) => ({ ...window, doctor: doctorId }))
  );

  await auditService.record({
    action: "DOCTOR_SCHEDULE_REPLACED",
    actor,
    targetType: "DoctorSchedule",
    targetId: doctorId,
    metadata: { doctor: String(doctorId), windows: normalised.length, removed: previous.length },
    req,
  });

  return created.map(presentWindow);
};

module.exports = {
  DEFAULT_WINDOW,
  WEEKDAY_LABELS,
  minutesToLabel,
  labelToMinutes,
  startOfDay,
  slotIsPast,
  listForDoctor,
  listForDoctors,
  windowsForDate,
  hasStoredSchedule,
  assertWithinAvailability,
  buildAvailability,
  addWindow,
  updateWindow,
  removeWindow,
  replaceForDoctor,
  normaliseWindow,
  presentWindow,
};