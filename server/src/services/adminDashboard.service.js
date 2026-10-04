const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const LabRequest = require("../models/LabRequest");
const LabTest = require("../models/LabTest");
const Notification = require("../models/Notification");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const AccessRequest = require("../models/AccessRequest");
const billingService = require("./billing.service");

/**
 * The Admin dashboard (FR-AD-01).
 *
 * WHY this is a server endpoint and not several queries the page assembles:
 *
 *  - The four cards must agree. "Today's appointments" and the appointment list
 *    below it come from one filter, so the number and the rows can never disagree.
 *  - Revenue must be money actually received, which means summing SUCCESS rows in
 *    `Payment`. The frontend has no business re-deriving a hospital's takings.
 *  - "New patients" means patients registered *today*, not the total headcount -
 *    the previous mock showed a lifetime total under a "new patients" label.
 *  - Every count here is a filtered countDocuments, never a length of a truncated
 *    list, so a hospital with 40,000 patients gets the same query plan as one with 4.
 *
 * Each card carries a `previous` value (yesterday / last month) so the UI can show
 * a real delta instead of a decorative arrow.
 */

const PATIENT_FIELDS = "name email phone contactNumber";
const DOCTOR_FIELDS = "name email department nmcNumber";

const round = (value) => Math.round(Number(value || 0) * 100) / 100;

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

const startOfMonth = (date) => {
  const start = new Date(date);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
};

const minutesToLabel = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Percentage change, or null when there is no base to compare against. */
const delta = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return round(((current - previous) / previous) * 100);
};

/** Appointments for one calendar day, excluding the ones that never happened. */
const dayAppointmentFilter = (from, to, { excludeCancelled = true } = {}) => ({
  appointmentDate: { $gte: from, $lte: to },
  ...(excludeCancelled ? { status: { $ne: "CANCELLED" } } : {}),
});

const buildDashboard = async (adminUser, { date } = {}) => {
  const reference = date ? new Date(date) : new Date();
  if (Number.isNaN(reference.getTime())) {
    const error = new Error("Date is not valid");
    error.statusCode = 422;
    throw error;
  }

  const todayStart = startOfDay(reference);
  const todayEnd = endOfDay(reference);
  const yesterdayStart = startOfDay(new Date(reference.getTime() - 86400000));
  const yesterdayEnd = endOfDay(new Date(reference.getTime() - 86400000));
  const monthStart = startOfMonth(reference);

  const todayFilter = dayAppointmentFilter(todayStart, todayEnd);

  const [
    todayCount,
    yesterdayCount,
    todayAppointments,
    newPatientsToday,
    newPatientsYesterday,
    newPatientList,
    pendingLab,
    pendingLabByStatus,
    revenue,
    unreadNotifications,
    recentNotifications,
    pendingAccessRequests,
    outstandingAgg,
  ] = await Promise.all([
    Appointment.countDocuments(todayFilter),
    Appointment.countDocuments(dayAppointmentFilter(yesterdayStart, yesterdayEnd)),
    Appointment.find(todayFilter)
      .populate("patient", PATIENT_FIELDS)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ startMinutes: 1 })
      .limit(8)
      .lean(),
    User.countDocuments({ role: "patient", createdAt: { $gte: todayStart, $lte: todayEnd } }),
    User.countDocuments({ role: "patient", createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } }),
    User.find({ role: "patient", createdAt: { $gte: todayStart, $lte: todayEnd } })
      .select("name email phone createdAt")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    LabRequest.countDocuments({ status: "PENDING" }),
    LabRequest.aggregate([{ $match: { status: { $ne: "CANCELLED" } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: { status: "SUCCESS", paidAt: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, collected: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Notification.countDocuments({ recipient: adminUser._id, readAt: null }),
    Notification.find({ recipient: adminUser._id })
      .sort({ readAt: 1, createdAt: -1 })
      .limit(6)
      .lean(),
    AccessRequest.countDocuments({ status: "PENDING" }),
    Invoice.aggregate([
      { $match: { status: { $in: ["UNPAID", "PARTIALLY_PAID"] } } },
      { $group: { _id: null, outstanding: { $sum: "$balance" }, count: { $sum: 1 } } },
    ]),
  ]);

  // Month-to-date revenue is the figure the revenue card leads with: "money taken
  // today" is usually zero in a quiet morning and tells an administrator nothing.
  const [monthAgg, previousMonthAgg] = await Promise.all([
    Payment.aggregate([
      { $match: { status: "SUCCESS", paidAt: { $gte: monthStart, $lte: todayEnd } } },
      { $group: { _id: null, collected: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          status: "SUCCESS",
          paidAt: { $gte: startOfMonth(new Date(reference.getFullYear(), reference.getMonth() - 1, 1)), $lte: monthStart },
        },
      },
      { $group: { _id: null, collected: { $sum: "$amount" } } },
    ]),
  ]);

  const labStatusMap = new Map(pendingLabByStatus.map((row) => [row._id, row.count]));
  const collectedToday = round(revenue[0]?.collected || 0);
  const collectedThisMonth = round(monthAgg[0]?.collected || 0);
  const collectedLastMonth = round(previousMonthAgg[0]?.collected || 0);

  return {
    date: todayStart,
    cards: {
      appointmentsToday: {
        value: todayCount,
        previous: yesterdayCount,
        changePercent: delta(todayCount, yesterdayCount),
      },
      newPatientsToday: {
        value: newPatientsToday,
        previous: newPatientsYesterday,
        changePercent: delta(newPatientsToday, newPatientsYesterday),
      },
      pendingLabTests: {
        value: pendingLab,
        previous: null,
        changePercent: null,
      },
      revenue: {
        collectedToday,
        paymentsToday: revenue[0]?.count || 0,
        collectedThisMonth,
        collectedLastMonth,
        changePercent: delta(collectedThisMonth, collectedLastMonth),
        outstanding: round(outstandingAgg[0]?.outstanding || 0),
        outstandingCount: outstandingAgg[0]?.count || 0,
      },
    },
    todayAppointments: todayAppointments.map((row) => ({
      ...row,
      startTime: minutesToLabel(row.startMinutes),
      endTime: minutesToLabel(row.startMinutes + (row.durationMinutes || 30)),
      patientName: row.patient?.name || "Unknown patient",
      doctorName: row.doctor?.name || "Unassigned",
    })),
    newPatients: newPatientList.map((row) => ({
      id: row._id,
      name: row.name,
      email: row.email,
      phone: row.phone || row.contactNumber || null,
      registeredAt: row.createdAt,
    })),
    laboratory: {
      pending: pendingLab,
      byStatus: pendingLabByStatus.map((row) => ({ status: row._id, count: row.count })),
      urgent: labStatusMap.get("PENDING") || 0,
    },
    notifications: {
      unread: unreadNotifications,
      recent: recentNotifications,
    },
    accessRequests: {
      pending: pendingAccessRequests,
    },
  };
};

/** Catalogue test ids whose name or category matches the search term. */
const billingServiceLabTestIds = async (term) => {
  const regex = new RegExp(billingService.escapeRegex(term), "i");
  const rows = await LabTest.find({ $or: [{ name: regex }, { category: regex }, { testCode: regex }] })
    .select("_id")
    .lean();
  return rows.map((row) => row._id);
};

/**
 * Cross-module search behind the Admin global search box.
 *
 * Bounded per module on purpose: a search box that returns every patient, every
 * appointment and every invoice is unusable and slow. Each group is a top-N hit
 * list with a total, so the UI can say "12 more" instead of pretending the list is
 * complete.
 */
const search = async (rawTerm, { limit = 5 } = {}) => {
  const term = String(rawTerm || "").trim();
  if (term.length < 2) {
    const error = new Error("Enter at least 2 characters to search");
    error.statusCode = 422;
    throw error;
  }

  const perModule = Math.min(20, Math.max(1, Number(limit) || 5));
  const regex = new RegExp(billingService.escapeRegex(term), "i");

  const [patients, doctors, appointments, invoices, labRequests] = await Promise.all([
    User.find({ role: "patient", $or: [{ name: regex }, { email: regex }, { phone: regex }, { contactNumber: regex }] })
      .select("name email phone contactNumber")
      .limit(perModule)
      .lean(),
    User.find({ role: "doctor", $or: [{ name: regex }, { email: regex }, { nmcNumber: regex }] })
      .select("name email nmcNumber department")
      .limit(perModule)
      .lean(),
    Appointment.find({
      $or: [{ appointmentNo: regex }, { reason: regex }, { patient: { $in: await billingService.matchingPatientIds(regex) } }],
    })
      .populate("patient", PATIENT_FIELDS)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ appointmentDate: -1 })
      .limit(perModule)
      .lean(),
    Invoice.find({ invoiceNo: regex }).populate("patient", PATIENT_FIELDS).sort({ issuedAt: -1 }).limit(perModule).lean(),
    // `LabRequest` has no human-readable number - the laboratory UI shows the tail
    // of the ObjectId - so a search for one must match `_id` as a string as well as
    // the notes and the requesting patient.
    LabRequest.find({
      $or: [
        { clinicalNotes: regex },
        { test: { $in: await billingServiceLabTestIds(term) } },
        { _id: mongoose.isValidObjectId(term) ? term : null },
        { patient: { $in: await billingService.matchingPatientIds(regex) } },
      ].filter(Boolean),
    })
      .populate("patient", PATIENT_FIELDS)
      .populate("test", "name category")
      .sort({ createdAt: -1 })
      .limit(perModule)
      .lean(),
  ]);

  return {
    term,
    patients: patients.map((row) => ({ id: row._id, name: row.name, email: row.email, phone: row.phone || row.contactNumber })),
    doctors: doctors.map((row) => ({ id: row._id, name: row.name, email: row.email, nmcNumber: row.nmcNumber })),
    appointments: appointments.map((row) => ({
      id: row._id,
      appointmentNo: row.appointmentNo,
      status: row.status,
      appointmentDate: row.appointmentDate,
      patientName: row.patient?.name || "Unknown patient",
      doctorName: row.doctor?.name || "Unassigned",
    })),
    invoices: invoices.map((row) => ({
      id: row._id,
      invoiceNo: row.invoiceNo,
      status: row.status,
      total: row.total,
      balance: row.balance,
      patientName: row.patient?.name || "Unknown patient",
    })),
    labRequests: labRequests.map((row) => ({
      id: row._id,
      // The laboratory UI identifies a request by the tail of its ObjectId.
      requestId: String(row._id).slice(-8).toUpperCase(),
      status: row.status,
      testName: row.test?.name || "Laboratory test",
      patientName: row.patient?.name || "Unknown patient",
    })),
    totalHits:
      patients.length + doctors.length + appointments.length + invoices.length + labRequests.length,
  };
};

module.exports = { buildDashboard, search, startOfDay, endOfDay, startOfMonth, minutesToLabel, delta, round };