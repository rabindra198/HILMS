const mongoose = require("mongoose");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");
const LabRequest = require("../models/LabRequest");
const LabTest = require("../models/LabTest");
const Payment = require("../models/Payment");
const Invoice = require("../models/Invoice");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const billingService = require("./billing.service");
const medicalHistoryService = require("./medicalHistory.service");
const { calculateAge, formatDate } = require("../utils/clinical");

/**
 * Administrative reporting (FR-AD-05).
 *
 * Every figure here is an aggregation over the operational collections. There are
 * no report tables and no cached figures, because a stored total is a total that
 * is wrong the moment an appointment is cancelled or a payment is recorded - and
 * a hospital billing report that disagrees with the billing screen is worse than
 * no report at all.
 *
 * The same functions produce both the on-screen payload and the exported file, so
 * a downloaded CSV is the table that was on screen rather than a separate query
 * that might answer a slightly different question.
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

const round = billingService.round;

const PATIENT_FIELDS = "name email phone contactNumber";
const DOCTOR_FIELDS = "name email department nmcNumber";

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

const minutesToLabel = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Validates a `YYYY-MM-DD` style input and returns its day bounds. */
const resolveDay = (input, fallback = new Date()) => {
  const date = input ? new Date(input) : fallback;
  if (Number.isNaN(date.getTime())) fail("Date is not valid", 422);
  return { date: startOfDay(date), from: startOfDay(date), to: endOfDay(date) };
};

/** Validates `?year=&month=` (1-12) and returns the whole calendar month. */
const resolveMonth = (yearInput, monthInput) => {
  const now = new Date();
  const year = Number.parseInt(yearInput, 10) || now.getFullYear();
  const month = Number.parseInt(monthInput, 10) || now.getMonth() + 1;

  if (year < 2000 || year > now.getFullYear() + 1) fail("Year is out of range", 422);
  if (month < 1 || month > 12) fail("Month must be between 1 and 12", 422);

  return {
    year,
    month,
    label: new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    from: new Date(year, month - 1, 1, 0, 0, 0, 0),
    to: new Date(year, month, 0, 23, 59, 59, 999),
  };
};

const revenueFor = async (from, to) => {
  const [collected, invoiced] = await Promise.all([
    Payment.aggregate([
      { $match: { status: "SUCCESS", paidAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { status: { $ne: "VOID" }, issuedAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    collected: round(collected[0]?.total || 0),
    payments: collected[0]?.count || 0,
    invoiced: round(invoiced[0]?.total || 0),
    invoices: invoiced[0]?.count || 0,
  };
};

const patientCountsFor = async (from, to) => {
  const [registered, byGender] = await Promise.all([
    User.countDocuments({ role: "patient", createdAt: { $gte: from, $lte: to } }),
    User.aggregate([
      { $match: { role: "patient", createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$gender", count: { $sum: 1 } } },
    ]),
  ]);

  const genders = { male: 0, female: 0, other: 0, unspecified: 0 };
  byGender.forEach((row) => {
    const key = row._id || "unspecified";
    if (key in genders) genders[key] = row.count;
  });

  return { registered, genders };
};

const laboratoryCountsFor = async (from, to) => {
  const rows = await LabRequest.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const byStatus = rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});

  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byStatus,
    pending: byStatus.PENDING || 0,
    verified: byStatus.VERIFIED || 0,
  };
};

/** Appointment breakdown by status, plus the busiest doctors in the window. */
const appointmentBreakdown = async (from, to) => {
  const [byStatus, byDoctor, total] = await Promise.all([
    Appointment.aggregate([
      { $match: { appointmentDate: { $gte: from, $lte: to } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Appointment.aggregate([
      { $match: { appointmentDate: { $gte: from, $lte: to }, status: { $ne: "CANCELLED" } } },
      { $group: { _id: "$doctor", count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    Appointment.countDocuments({ appointmentDate: { $gte: from, $lte: to } }),
  ]);

  const statuses = byStatus.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});

  const doctors = await User.find({ _id: { $in: byDoctor.map((row) => row._id) } })
    .select(DOCTOR_FIELDS)
    .lean();

  const nameOf = new Map(doctors.map((row) => [String(row._id), row.name]));

  return {
    total,
    byStatus: statuses,
    completed: statuses.COMPLETED || 0,
    cancelled: statuses.CANCELLED || 0,
    noShow: statuses.NO_SHOW || 0,
    noShowRate: total ? round(((statuses.NO_SHOW || 0) / total) * 100) : 0,
    topDoctors: byDoctor.map((row) => ({
      doctorId: row._id,
      name: nameOf.get(String(row._id)) || "Unknown doctor",
      appointments: row.count,
      completed: row.completed,
    })),
  };
};

/**
 * The daily report (FR-AD-05).
 *
 * Returns both the figures and the rows behind them, because the same payload
 * drives the screen and the CSV/PDF export - one function, no second query that
 * could answer a different question.
 */
const getDailyReport = async (dateInput) => {
  const { date, from, to } = resolveDay(dateInput);

  const [appointments, patients, revenue, laboratory, labRequests] = await Promise.all([
    appointmentBreakdown(from, to),
    patientCountsFor(from, to),
    revenueFor(from, to),
    laboratoryCountsFor(from, to),
    LabRequest.find({ createdAt: { $gte: from, $lte: to } })
      .populate("patient", PATIENT_FIELDS)
      .populate("test", "name category")
      .populate("doctor", "name")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  return {
    kind: "daily",
    title: "Daily Report",
    date,
    range: { from, to },
    figures: {
      appointments: appointments.total,
      completed: appointments.completed,
      newPatients: patients.registered,
      revenue: revenue.collected,
      labRequests: laboratory.total,
    },
    appointments,
    patients,
    revenue,
    laboratory,
    columns: [
      { label: "Requested", key: "requestedDate", width: 78 },
      { label: "Patient", key: "patientName", weight: 1.4 },
      { label: "Test", key: "testName", weight: 1.4 },
      { label: "Priority", key: "priority", width: 62 },
      { label: "Status", key: "status", width: 82 },
      { label: "Doctor", key: "doctorName", weight: 1 },
    ],
    rows: labRequests.map((row) => ({
      requestedDate: row.requestedDate ? formatDate(row.requestedDate) : formatDate(row.createdAt),
      patientName: row.patient?.name || "Unknown patient",
      testName: row.test?.name || row.test?.testName || "Laboratory test",
      priority: row.priority,
      status: row.status,
      doctorName: row.doctor?.name || "-",
    })),
    footnote: `Laboratory activity for ${date.toDateString()}. Revenue is the total of payments settled on this date.`,
  };
};

/**
 * The monthly report (FR-AD-05).
 *
 * The per-day breakdown is what turns a month from twelve unrelated days into a
 * trend, so it is the primary table rather than an extra.
 */
const getMonthlyReport = async (yearInput, monthInput) => {
  const { from, to, label, year, month } = resolveMonth(yearInput, monthInput);

  const [appointments, patients, revenue, laboratory, dailySeries] = await Promise.all([
    appointmentBreakdown(from, to),
    patientCountsFor(from, to),
    revenueFor(from, to),
    laboratoryCountsFor(from, to),
    Promise.all([
      Appointment.aggregate([
        { $match: { appointmentDate: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$appointmentDate" } },
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $match: { role: "patient", createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { status: "SUCCESS", paidAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]),
  ]);

  // Merge the three independent per-day series into one row per day that had any
  // activity, so the table reads as a calendar rather than three separate lists.
  const byDay = new Map();
  const ensure = (key) => {
    if (!byDay.has(key)) {
      byDay.set(key, { day: key, appointments: 0, completed: 0, cancelled: 0, newPatients: 0, payments: 0, revenue: 0 });
    }
    return byDay.get(key);
  };

  dailySeries[0].forEach((row) => Object.assign(ensure(row._id), row));
  dailySeries[1].forEach((row) => {
    ensure(row._id).newPatients = row.count;
  });
  dailySeries[2].forEach((row) => {
    const entry = ensure(row._id);
    entry.payments = row.count;
    entry.revenue = round(row.total);
  });

  const rows = [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      day: row.day,
      dayLabel: new Date(`${row.day}T00:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      appointments: row.appointments,
      completed: row.completed,
      cancelled: row.cancelled,
      newPatients: row.newPatients,
      payments: row.payments,
      revenue: row.revenue,
    }));

  const daysElapsed = new Date(to).getDate();
  const activeDays = rows.length || 1;

  return {
    kind: "monthly",
    title: "Monthly Report",
    label,
    year,
    month,
    range: { from, to },
    figures: {
      appointments: appointments.total,
      completed: appointments.completed,
      newPatients: patients.registered,
      revenue: revenue.collected,
      labRequests: laboratory.total,
    },
    appointments,
    patients,
    revenue,
    laboratory,
    averages: {
      appointmentsPerActiveDay: round(appointments.total / activeDays),
      revenuePerActiveDay: round(revenue.collected / activeDays),
      revenuePerElapsedDay: round(revenue.collected / Math.max(1, daysElapsed)),
    },
    columns: [
      { label: "Day", key: "dayLabel", width: 62 },
      { label: "Appointments", key: "appointments", width: 74, align: "right" },
      { label: "Completed", key: "completed", width: 66, align: "right" },
      { label: "Cancelled", key: "cancelled", width: 66, align: "right" },
      { label: "New patients", key: "newPatients", width: 78, align: "right" },
      { label: "Payments", key: "payments", width: 66, align: "right" },
      { label: "Revenue", key: "revenue", width: 80, align: "right" },
    ],
    rows,
    footnote: `${label}. Revenue is the total of payments settled within the month; invoices raised in the month totalled ${revenue.invoiced}.`,
  };
};

/**
 * One patient's full report.
 *
 * The clinical timeline comes from `medicalHistoryService.buildHistory` - the same
 * projection the doctor workspace renders - so this report cannot show a different
 * clinical history than the treating clinician sees. Billing comes from
 * `billingService.getPatientBilling`, the same figures the patient sees.
 */
const getPatientReport = async (patientId, query = {}) => {
  const id = objectId(patientId, "patient id");

  const patient = await User.findById(id).lean();
  if (!patient) fail("Patient not found", 404);
  if (patient.role !== "patient") fail("That account is not a patient", 422);

  const [appointments, consultations, prescriptions, labRequests, billing, doctors] = await Promise.all([
    Appointment.find({ patient: id })
      .populate("doctor", "name department")
      .sort({ appointmentDate: -1 })
      .limit(100)
      .lean(),
    Consultation.find({ patient: id })
      .populate("doctor", "name department")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Prescription.find({ patient: id })
      .populate("doctor", "name")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    LabRequest.find({ patient: id })
      .populate("test", "name category")
      .populate("doctor", "name")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    billingService.getPatientBilling(id),
    DoctorPatientAssignment.find({ patient: id, revokedAt: null })
      .populate("doctor", DOCTOR_FIELDS)
      .lean(),
  ]);

  const history = await medicalHistoryService.buildHistory(id, { limit: 100 });

  return {
    kind: "patient",
    title: "Patient Report",
    patient: {
      id: patient._id,
      reference: `PT-${String(patient._id).slice(-6).toUpperCase()}`,
      name: patient.name,
      email: patient.email,
      contactNumber: patient.contactNumber || patient.phone || null,
      address: patient.address || null,
      dateOfBirth: patient.dateOfBirth || null,
      age: calculateAge(patient.dateOfBirth),
      gender: patient.gender || null,
      bloodGroup: patient.bloodGroup || null,
      allergies: patient.allergies || null,
      registeredAt: patient.createdAt,
    },
    careTeam: doctors.map((row) => row.doctor).filter(Boolean),
    figures: {
      appointments: appointments.length,
      consultations: consultations.length,
      prescriptions: prescriptions.length,
      labRequests: labRequests.length,
      outstanding: billing.summary.outstanding,
    },
    billing,
    history,
    columns: [
      { label: "Date", key: "date", width: 74 },
      { label: "Reference", key: "reference", width: 96 },
      { label: "Detail", key: "detail", weight: 2 },
      { label: "Clinician", key: "actor", weight: 1 },
      { label: "Status", key: "status", width: 78 },
    ],
    rows: history.events.map((event) => ({
      date: event.at ? formatDate(event.at) : "-",
      reference:
        event.appointmentNo || event.consultationNo || event.prescriptionNo || event.reportId || "-",
      detail: event.title,
      actor: event.actor || "-",
      status: event.status || event.type,
    })),
    footnote: `Clinical history for ${patient.name} (${patient.email}). Totals reflect records currently stored in HILMS.`,
  };
};

/** Searchable patient picker for the "generate report for a patient" screen. */
const searchPatients = async (query = {}) => {
  const filter = { role: "patient" };
  if (query.search) {
    const regex = new RegExp(billingService.escapeRegex(String(query.search).trim()), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }, { contactNumber: regex }];
  }

  return User.find(filter)
    .select("name email phone contactNumber dateOfBirth")
    .sort({ name: 1 })
    .limit(30)
    .lean();
};

/** Revenue report across an arbitrary window, grouped by day and by method. */
const getRevenueReport = async (query = {}) => {
  const { from, to } = resolveDay(query.from);
  const toDate = query.to ? endOfDay(new Date(query.to)) : to;
  if (Number.isNaN(toDate.getTime())) fail("The end of the date range is not valid", 422);

  const [byDay, byMethod, invoices] = await Promise.all([
    Payment.aggregate([
      { $match: { status: "SUCCESS", paidAt: { $gte: from, $lte: toDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: { status: "SUCCESS", paidAt: { $gte: from, $lte: toDate } } },
      { $group: { _id: "$method", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Invoice.find({ issuedAt: { $gte: from, $lte: toDate } })
      .populate("patient", PATIENT_FIELDS)
      .sort({ issuedAt: -1 })
      .limit(200)
      .lean(),
  ]);

  const total = round(byDay.reduce((sum, row) => sum + row.total, 0));

  return {
    kind: "revenue",
    title: "Revenue Report",
    range: { from, to: toDate },
    figures: {
      collected: total,
      payments: byDay.reduce((sum, row) => sum + row.count, 0),
      invoices: invoices.length,
      invoiced: round(invoices.filter((row) => row.status !== "VOID").reduce((sum, row) => sum + row.total, 0)),
      outstanding: round(
        invoices.filter((row) => ["UNPAID", "PARTIALLY_PAID"].includes(row.status)).reduce((sum, row) => sum + row.balance, 0)
      ),
    },
    byMethod: byMethod.map((row) => ({ method: row._id, count: row.count, total: round(row.total) })),
    columns: [
      { label: "Invoice", key: "invoiceNo", width: 104 },
      { label: "Patient", key: "patientName", weight: 1.6 },
      { label: "Issued", key: "issued", width: 76 },
      { label: "Status", key: "status", width: 82 },
      { label: "Total", key: "total", width: 70, align: "right" },
      { label: "Balance", key: "balance", width: 70, align: "right" },
    ],
    rows: invoices.map((row) => ({
      invoiceNo: row.invoiceNo,
      patientName: row.patient?.name || "Unknown patient",
      issued: formatDate(row.issuedAt),
      status: row.status,
      total: row.total,
      balance: row.balance,
    })),
    dailyTotals: byDay.map((row) => ({ day: row._id, count: row.count, total: round(row.total) })),
    footnote: `Payments settled between ${formatDate(from)} and ${formatDate(toDate)}.`,
  };
};

/** Laboratory throughput report across a window. */
const getLaboratoryReport = async (query = {}) => {
  const { from, to } = resolveDay(query.from);
  const toDate = query.to ? endOfDay(new Date(query.to)) : to;
  if (Number.isNaN(toDate.getTime())) fail("The end of the date range is not valid", 422);

  const [byTest, byStatus, requests] = await Promise.all([
    LabRequest.aggregate([
      { $match: { createdAt: { $gte: from, $lte: toDate } } },
      { $group: { _id: "$test", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    laboratoryCountsFor(from, toDate),
    LabRequest.find({ createdAt: { $gte: from, $lte: toDate } })
      .populate("test", "name category price")
      .populate("patient", PATIENT_FIELDS)
      .populate("doctor", "name")
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),
  ]);

  const tests = await LabTest.find({ _id: { $in: byTest.map((row) => row._id) } })
    .select("name category price")
    .lean();

  const testOf = new Map(tests.map((row) => [String(row._id), row]));

  return {
    kind: "laboratory",
    title: "Laboratory Report",
    range: { from, to: toDate },
    figures: {
      totalRequests: byStatus.total,
      completed: byStatus.byStatus.COMPLETED || 0,
      verified: byStatus.verified,
      pending: byStatus.pending,
    },
    byStatus: byStatus.byStatus,
    columns: [
      { label: "Requested", key: "requested", width: 76 },
      { label: "Patient", key: "patientName", weight: 1.4 },
      { label: "Test", key: "testName", weight: 1.4 },
      { label: "Category", key: "category", width: 88 },
      { label: "Status", key: "status", width: 84 },
    ],
    rows: requests.map((row) => ({
      requested: formatDate(row.requestedDate || row.createdAt),
      patientName: row.patient?.name || "Unknown patient",
      testName: row.test?.name || row.test?.testName || "Laboratory test",
      category: row.test?.category || "-",
      status: row.status,
    })),
    topTests: byTest.map((row) => {
      const test = testOf.get(String(row._id));
      return { name: test?.name || "Unknown test", category: test?.category || null, count: row.count, price: test?.price ?? null };
    }),
    footnote: `Laboratory activity between ${formatDate(from)} and ${formatDate(toDate)}.`,
  };
};

/** Dispatches by the `?kind=` the report screen sends. */
const build = async (kind, params = {}) => {
  switch (kind) {
    case "daily":
      return getDailyReport(params.date);
    case "monthly":
      return getMonthlyReport(params.year, params.month);
    case "patient":
      return getPatientReport(params.patientId, params);
    case "revenue":
      return getRevenueReport(params);
    case "laboratory":
      return getLaboratoryReport(params);
    default:
      return fail(`Report kind "${kind}" is not valid. Use daily, monthly, patient, revenue or laboratory.`, 422);
  }
};

module.exports = {
  build,
  getDailyReport,
  getMonthlyReport,
  getPatientReport,
  getRevenueReport,
  getLaboratoryReport,
  searchPatients,
  resolveDay,
  resolveMonth,
  startOfDay,
  endOfDay,
  minutesToLabel,
  round,
};