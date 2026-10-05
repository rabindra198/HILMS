const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");
const LabRequest = require("../models/LabRequest");
const LabReport = require("../models/LabReport");
const SampleCollection = require("../models/SampleCollection");
const Notification = require("../models/Notification");

const appointmentService = require("./appointment.service");
const prescriptionService = require("./prescription.service");
const billingService = require("./billing.service");
const { RELEASED_REPORT_STATUSES: RELEASED } = require("./lab.service");
const { calculateAge } = require("../utils/clinical");
const medicalHistoryService = require("./medicalHistory.service");

/** Money is rounded to 2dp before it leaves this file, matching the billing module. */
const round = (value) => Math.round(Number(value || 0) * 100) / 100;

/**
 * Patient self-service.
 *
 * AUTHORIZATION MODEL - the single most important rule in this file:
 *
 *   Every function takes `patientId` as its first argument, and that value is
 *   supplied by the controller from `req.user._id` after `protect` + `authorize`
 *   have verified the JWT. It is NEVER read from the request body, query string
 *   or a route parameter. Ownership is then enforced inside the database query
 *   (`{ _id: id, patient: patientId }`), so a patient asking for someone else's
 *   record gets a 404 rather than an empty result.
 *
 * NO DUPLICATE RECORDS. Nothing here creates a patient-specific copy of an
 * appointment, consultation, prescription, lab request or report. Every function
 * reads the SAME collection that the Doctor and Laboratory modules write, which
 * is what makes the four modules one system instead of four.
 *
 * PRIVACY. `Consultation.doctorNotes` is the doctor's private working note and is
 * never projected into a patient response - the projection below is an explicit
 * allow-list precisely so a new internal field cannot leak by being added later.
 * Laboratory reports are visible only once the laboratory has VERIFIED them.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const DOCTOR_FIELDS = "name email nmcNumber department specialization qualification";
const TEST_FIELDS = "name price sampleType description";

/** The public patient reference used on printed documents (never a raw ObjectId). */
const reference = (id) => `PT-${String(id).slice(-6).toUpperCase()}`;

const parseDateInput = (value, fallback = new Date()) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const clampLimit = (value, fallback, max) =>
  Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));

const paginate = (total, page, limit) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

/** True when the appointment is still ahead of the patient right now. */
const isUpcoming = (appointment) => {
  if (!["SCHEDULED", "CONFIRMED", "IN_CONSULTATION"].includes(appointment.status)) return false;
  const day = appointment.appointmentDate?.getTime?.() ?? new Date(appointment.appointmentDate).getTime();
  if (Number.isNaN(day)) return false;
  return day + (appointment.startMinutes + (appointment.durationMinutes || 30)) * 60000 > Date.now();
};

/* ------------------------------------------------------------------ profile */

// `role` and `status` are included because `shapeProfile` reports them. They are
// read-only for the patient: they are absent from UPDATEABLE below, so they can be
// displayed but never changed by the account that owns them.
const PROFILE_FIELDS =
  "name email role status phone contactNumber address profilePhotoUrl dateOfBirth gender bloodGroup allergies emergencyContactName emergencyContactNumber";

const shapeProfile = (user) => ({
  id: user._id,
  reference: reference(user._id),
  name: user.name,
  email: user.email,
  // Read-only here: it is written only by the photo-upload endpoint, never by
  // the profile form, so editing personal details can never clear the photo.
  profilePhotoUrl: user.profilePhotoUrl || null,
  phone: user.phone || null,
  contactNumber: user.contactNumber || user.phone || null,
  address: user.address || null,
  dateOfBirth: user.dateOfBirth || null,
  age: user.dateOfBirth ? calculateAge(user.dateOfBirth) : null,
  gender: user.gender || null,
  bloodGroup: user.bloodGroup || null,
  allergies: user.allergies || null,
  emergencyContact: user.emergencyContactName || user.emergencyContactNumber
    ? { name: user.emergencyContactName || null, number: user.emergencyContactNumber || null }
    : null,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt,
});

const getProfile = async (patientId) => {
  const user = await User.findById(patientId).select(PROFILE_FIELDS).lean();
  if (!user) fail("Patient account not found", 404);
  return shapeProfile(user);
};

/**
 * Self-service profile edits.
 *
 * Allow-list, mirroring `doctorAccount.service.updateProfile`. Role, status,
 * isActive, email and the temporary-password flags are deliberately NOT editable:
 * changing your own role or approval state is never a self-service action.
 */
const UPDATEABLE = [
  "name",
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

const updateProfile = async (patientId, payload = {}) => {
  const user = await User.findById(patientId);
  if (!user) fail("Patient account not found", 404);

  for (const field of UPDATEABLE) {
    if (payload[field] === undefined) continue;
    let value = payload[field];
    if (typeof value === "string") value = value.trim();

    if (field === "dateOfBirth") {
      if (!value) {
        user.dateOfBirth = null;
        continue;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) fail("Date of birth is not valid", 422);
      if (parsed.getTime() > Date.now()) fail("Date of birth cannot be in the future", 422);
      user.dateOfBirth = parsed;
      continue;
    }

    if (field === "name" && !value) fail("Name is required", 422);
    user[field] = value || "";
  }

  await user.save();
  return shapeProfile(user.toObject());
};

/* ---------------------------------------------------------------- dashboard */

const listDoctors = async (query = {}) => {
  const limit = clampLimit(query.limit, 50, 100);
  const filter = { role: "doctor", status: "APPROVED", isActive: true };

  if (query.department) filter.department = query.department;
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    filter.$or = [{ name: regex }, { department: regex }, { specialization: regex }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).select(DOCTOR_FIELDS).sort({ name: 1 }).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return { items, pagination: paginate(total, 1, limit) };
};

/**
 * The dashboard aggregate.
 *
 * Deliberately small - "what is happening with my healthcare right now?" - and
 * deliberately NOT a copy of the doctor dashboard's operational statistics.
 */
const getSummary = async (patientId) => {
  const now = new Date();
  const startOfToday = appointmentService.startOfDay(now);

  const [
    upcomingAppointments,
    recentAppointments,
    pendingLabRequests,
    verifiedReports,
    activePrescriptions,
    latestReport,
    latestPrescription,
    latestConsultation,
    unreadNotifications,
    labCharges,
    billingSummary,
  ] = await Promise.all([
    Appointment.find({
      patient: patientId,
      status: { $in: ["SCHEDULED", "CONFIRMED"] },
      appointmentDate: { $gte: startOfToday },
    })
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ appointmentDate: 1, startMinutes: 1 })
      .limit(5)
      .lean(),
    Appointment.find({ patient: patientId })
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ appointmentDate: -1, startMinutes: -1 })
      .limit(3)
      .lean(),
    LabRequest.countDocuments({
      patient: patientId,
      status: { $nin: ["VERIFIED", "CANCELLED"] },
    }),
    LabReport.countDocuments({ patient: patientId, status: { $in: RELEASED } }),
    Prescription.countDocuments({ patient: patientId, status: "ISSUED" }),
    LabReport.findOne({ patient: patientId, status: { $in: RELEASED } })
      .populate("test", TEST_FIELDS)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ verifiedAt: -1 })
      .lean(),
    Prescription.findOne({ patient: patientId, status: "ISSUED" })
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ issuedAt: -1 })
      .lean(),
    Consultation.findOne({ patient: patientId, status: "COMPLETED" })
      .select("consultationNo diagnosis completedAt")
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ completedAt: -1 })
      .lean(),
    Notification.countDocuments({ recipient: patientId, readAt: null }),
    LabRequest.aggregate([
      { $match: { patient: patientId, status: { $ne: "CANCELLED" } } },
      { $lookup: { from: "labtests", localField: "test", foreignField: "_id", as: "test" } },
      { $unwind: "$test" },
      { $group: { _id: null, total: { $sum: "$test.price" }, count: { $sum: 1 } } },
    ]),
    billingService.getPatientBilling(patientId),
  ]);

  const charges = labCharges[0] || { total: 0, count: 0 };

  return {
    upcomingAppointment: upcomingAppointments.find(isUpcoming) || upcomingAppointments[0] || null,
    upcomingAppointmentCount: upcomingAppointments.filter(isUpcoming).length,
    recentAppointments,
    pendingLabRequestCount: pendingLabRequests,
    verifiedReportCount: verifiedReports,
    activePrescriptionCount: activePrescriptions,
    unreadNotificationCount: unreadNotifications,
    latestReport,
    latestPrescription,
    latestConsultation,
    billing: {
      // Real money figures only. Invoice and Payment exist, and eSewa is verified
      // server-side, so gateway availability is read from the provider registry
      // rather than assumed off. `LabTest.price` remains the only priced field for
      // work that has not been invoiced yet.
      chargesTotal: charges.total || 0,
      chargesCount: charges.count || 0,
      gatewayConfigured: billingSummary.summary.gatewayConfigured ?? false,
      outstanding: billingSummary.summary.outstanding,
    },
  };
};

/* ------------------------------------------------------------- appointments */

const shapeAppointment = (appointment) => ({
  id: appointment._id,
  appointmentNo: appointment.appointmentNo,
  appointmentDate: appointment.appointmentDate,
  startMinutes: appointment.startMinutes,
  durationMinutes: appointment.durationMinutes,
  type: appointment.type,
  status: appointment.status,
  reason: appointment.reason || null,
  cancelledReason: appointment.cancelledReason || null,
  followUpOf: appointment.followUpOf || null,
  upcoming: isUpcoming(appointment),
  doctor: appointment.doctor
    ? {
        id: appointment.doctor._id,
        name: appointment.doctor.name,
        department: appointment.doctor.department || null,
        specialization: appointment.doctor.specialization || null,
      }
    : null,
});

const listAppointments = async (patientId, query = {}) => {
  const filter = { patient: patientId };
  const limit = clampLimit(query.limit, 20, 100);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  if (query.status) filter.status = String(query.status).toUpperCase();
  if (query.type) filter.type = String(query.type).toUpperCase();
  if (query.scope === "upcoming") filter.appointmentDate = { $gte: appointmentService.startOfDay(new Date()) };
  if (query.scope === "past") {
    filter.appointmentDate = { $lte: appointmentService.endOfDay(new Date(Date.now() - 86400000)) };
  }
  if (query.date) {
    const { from, to } = appointmentService.dayBounds(query.date);
    filter.appointmentDate = { $gte: from, $lte: to };
  }
  if (query.doctorId) filter.doctor = query.doctorId;

  const [rows, total] = await Promise.all([
    Appointment.find(filter)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ appointmentDate: -1, startMinutes: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  return {
    items: rows.map(shapeAppointment),
    pagination: paginate(total, page, limit),
  };
};

/** Follow-ups are appointments of type FOLLOW_UP - no separate collection. */
const listFollowUps = async (patientId, query = {}) =>
  listAppointments(patientId, { ...query, type: "FOLLOW_UP" });

const bookAppointment = async (patientId, payload, patientDoc) =>
  appointmentService.bookForPatient(payload, patientDoc, { _id: patientId });

const cancelAppointment = async (patientId, appointmentId, reason) =>
  appointmentService.cancelByPatient(appointmentId, patientId, reason);

/* ------------------------------------------------------------ consultations */

/**
 * Patient-visible consultation projection.
 *
 * An explicit allow-list. `doctorNotes` is the doctor's private working note and
 * is structurally absent here - it cannot leak because it is never selected.
 */
const CONSULTATION_FIELDS =
  "consultationNo chiefComplaint symptoms clinicalNotes diagnosis treatmentPlan treatmentOutcome status startedAt completedAt appointment doctor vitals";

const listConsultations = async (patientId, query = {}) => {
  const filter = { patient: patientId };
  const limit = clampLimit(query.limit, 20, 50);

  if (query.doctorId) filter.doctor = query.doctorId;
  if (query.status) filter.status = String(query.status).toUpperCase();

  const [rows, total] = await Promise.all([
    Consultation.find(filter)
      .select(CONSULTATION_FIELDS)
      .populate("doctor", DOCTOR_FIELDS)
      .sort({ startedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean(),
    Consultation.countDocuments(filter),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      id: row._id,
      doctor: row.doctor
        ? { id: row.doctor._id, name: row.doctor.name, department: row.doctor.department || null }
        : null,
    })),
    pagination: paginate(total, 1, limit),
  };
};

/* ------------------------------------------------------------------- history */

/** Patient view of the same shared event projection used by the doctor/admin chart. */
const getHistory = async (patientId, query = {}) => {
  const history = await medicalHistoryService.buildHistory(patientId, {
    ...query,
    limit: Number.parseInt(query.limit, 10) || 50,
    includeCancelled: true,
  });
  const idPrefixes = {
    APPOINTMENT: "apt",
    CONSULTATION: "con",
    PRESCRIPTION: "rx",
    LAB_REQUEST: "labreq",
    LAB_REPORT: "labrep",
    SAMPLE_COLLECTION: "sample",
    PAYMENT: "payment",
  };

  return {
    ...history,
    events: history.events.map((event) => ({
      ...event,
      id: `${idPrefixes[event.type] || "event"}-${event.id}`,
      reference:
        event.appointmentNo ||
        event.consultationNo ||
        event.prescriptionNo ||
        event.reportId ||
        event.sampleId ||
        event.paymentNo ||
        null,
    })),
  };
};

/* ------------------------------------------------------------- prescriptions */

const shapePrescription = (row) => ({
  id: row._id,
  prescriptionNo: row.prescriptionNo,
  status: row.status,
  issuedAt: row.issuedAt || null,
  followUpDate: row.followUpDate || null,
  notes: row.notes || null,
  doctor: row.doctor
    ? { id: row.doctor._id, name: row.doctor.name, department: row.doctor.department || null }
    : null,
  consultation: row.consultation
    ? { id: row.consultation._id, diagnosis: row.consultation.diagnosis || null }
    : null,
  medicines: (row.items || []).map((item) => ({
    id: item._id,
    medicine: item.medicine,
    dosage: item.dosage,
    frequency: item.frequency,
    duration: item.duration,
    route: item.route,
    instructions: item.instructions || null,
    quantity: item.quantity ?? null,
  })),
  medicineCount: (row.items || []).length,
});

const listPrescriptions = async (patientId, query = {}) => {
  const filter = { patient: patientId, status: { $ne: "DRAFT" } };
  const limit = clampLimit(query.limit, 20, 50);

  if (query.doctorId) filter.doctor = query.doctorId;
  if (query.status) filter.status = String(query.status).toUpperCase();

  const rows = await Prescription.find(filter)
    .populate("doctor", DOCTOR_FIELDS)
    .populate("consultation", "diagnosis")
    .sort({ issuedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return { items: rows.map(shapePrescription) };
};

/**
 * The printable prescription document.
 *
 * Ownership is proven by the query, then the SHARED pure builder runs, so the
 * patient receives exactly the document `utils/prescriptionPdf.js` produces for the
 * doctor - not a patient-specific re-render.
 */
const getPrescriptionDocument = async (patientId, prescriptionId) => {
  const prescription = await Prescription.findOne({ _id: prescriptionId, patient: patientId })
    .populate("patient", PROFILE_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .populate("consultation", "consultationNo diagnosis completedAt")
    .lean();

  if (!prescription) fail("Prescription not found", 404);
  return prescriptionService.buildDocumentForPrescription(prescription);
};

/* ---------------------------------------------------------------- laboratory */

/** Patient-facing request timeline. Status is the laboratory's own enum. */
const REQUEST_PROGRESS = ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED"];

const requestStage = (status) => {
  const index = REQUEST_PROGRESS.indexOf(String(status || "").toUpperCase());
  return index === -1 ? 0 : index;
};

const listLabRequests = async (patientId, query = {}) => {
  const filter = { patient: patientId };
  const limit = clampLimit(query.limit, 20, 100);

  if (query.status) filter.status = String(query.status).toUpperCase();
  if (query.testId) filter.test = query.testId;

  const rows = await LabRequest.find(filter)
    .populate("test", TEST_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .sort({ requestedDate: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  // The sample lives in its own collection keyed by `labRequest`, so it cannot be
  // populated onto LabRequest. Fetch the latest collection per request instead of
  // a `.populate("sample")`, which does not exist on the schema.
  const samples = rows.length
    ? await SampleCollection.find({ labRequest: { $in: rows.map((row) => row._id) } })
        .sort({ collectionDate: -1, createdAt: -1 })
        .lean()
    : [];
  const sampleByRequest = new Map();
  for (const sample of samples) {
    const key = String(sample.labRequest);
    if (!sampleByRequest.has(key)) sampleByRequest.set(key, sample);
  }

  return {
    items: rows.map((row) => {
      const sample = sampleByRequest.get(String(row._id));
      return {
        id: row._id,
        status: row.status,
        sampleStatus: row.sampleStatus || sample?.status || null,
        priority: row.priority,
        requestedDate: row.requestedDate,
        stage: requestStage(row.status),
        totalStages: REQUEST_PROGRESS.length,
        timeline: REQUEST_PROGRESS,
        test: row.test ? { id: row.test._id, name: row.test.name, price: row.test.price ?? null } : null,
        doctor: row.doctor ? { id: row.doctor._id, name: row.doctor.name } : null,
        sample: sample
          ? {
              sampleId: sample.sampleId || null,
              collectedAt: sample.collectionDate || null,
              status: sample.status || null,
            }
          : null,
      };
    }),
  };
};

/**
 * Reports visible to the patient.
 *
 * Patient visibility IS verification: `lab.service.verifyReport` is the only way a
 * report leaves DRAFT/COMPLETED, and that same transaction flips the parent
 * LabRequest to VERIFIED and notifies the patient. There is no separate
 * "share with patient" flag to get out of step.
 */
const listLabReports = async (patientId, query = {}) => {
  const filter = { patient: patientId, status: { $in: RELEASED } };
  const limit = clampLimit(query.limit, 20, 50);

  if (query.testId) filter.test = query.testId;

  const rows = await LabReport.find(filter)
    .populate("test", TEST_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .sort({ verifiedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return { items: rows.map((row) => ({ id: row._id, reportId: row.reportId, verifiedAt: row.verifiedAt, remarks: row.remarks || null, test: row.test ? { id: row.test._id, name: row.test.name } : null, doctor: row.doctor ? { id: row.doctor._id, name: row.doctor.name } : null })) };
};

const getLabReport = async (patientId, reportId) => {
  const report = await LabReport.findOne({ _id: reportId, patient: patientId, status: { $in: RELEASED } })
    .populate("test", TEST_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .populate("sample", "sampleId collectionDate collectionTime sampleType status barcode")
    .populate("results", "parameters enteredAt updatedAt")
    .lean();

  if (!report) fail("Laboratory report not found", 404);

  return {
    id: report._id,
    reportId: report.reportId,
    status: report.status,
    verifiedAt: report.verifiedAt,
    remarks: report.remarks || null,
    test: report.test
      ? { id: report.test._id, name: report.test.name, description: report.test.description || null }
      : null,
    doctor: report.doctor ? { id: report.doctor._id, name: report.doctor.name, department: report.doctor.department || null } : null,
    sample: report.sample
      ? {
          sampleId: report.sample.sampleId,
          sampleType: report.sample.sampleType,
          collectedAt: report.sample.collectionDate,
          status: report.sample.status,
        }
      : null,
    parameters: (report.results || []).flatMap((result) =>
      (result.parameters || []).map((parameter) => ({
        parameter: parameter.parameter,
        value: parameter.value,
        unit: parameter.unit || null,
        referenceRange: parameter.referenceRange || null,
        flag: parameter.flag || null,
        remarks: parameter.remarks || null,
      }))
    ),
    // The reviewing doctor's clinical interpretation. The internal
    // treatmentDecision/outcome fields are deliberately not exposed.
    doctorComments: (report.doctorComments || []).map((entry) => ({
      comment: entry.comment,
      interpretation: entry.interpretation || null,
      commentedAt: entry.commentedAt,
    })),
  };
};

/* ------------------------------------------------------------------ payments */

/**
 * Billing view.
 *
 * Reads the SAME `billingService` records the administrator bills from, so the
 * patient and the Admin can never hold different numbers for the same visit. This
 * replaced a stub that derived charges from `LabTest.price` and reported
 * `paymentStatus: "NOT_TRACKED"` - which meant the patient saw a running total
 * they were never told they owed, with no way to pay.
 *
 * Two kinds of money appear here and they are kept distinct:
 *  - invoices / payments  - real, issued by an Admin, settled and stored
 *  - `pendingCharges`     - verified laboratory work priced from `LabTest.price`
 *    that has NOT been invoiced yet. Surfacing it is honest ("this is what it will
 *    cost"); inventing an invoice for it would not be.
 */
const listPayments = async (patientId) => {
  const billing = await billingService.getPatientBilling(patientId);

  const items = [
    ...billing.invoices.map((invoice) => ({
      id: `invoice-${invoice._id}`,
      // The raw id, so the screen can start an eSewa payment against THIS invoice
      // rather than trying to parse it back out of the display `id`.
      invoiceId: String(invoice._id),
      kind: "INVOICE",
      reference: invoice.invoiceNo,
      description: `${invoice.items.length} line item(s)`,
      amount: invoice.total,
      balance: invoice.balance,
      // Can this invoice still take money? A settled or voided one cannot.
      payable: invoice.status !== "VOID" && invoice.balance > 0,
      date: invoice.issuedAt,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      serviceType: "INVOICE",
      // A real settlement state, derived from the payments recorded against it.
      paymentStatus: invoice.status,
      // What stage the billed work itself is at, which is a separate question from
      // whether the money has arrived.
      fulfilmentStatus: "INVOICED",
      notes: invoice.notes || null,
      doctor: null,
    })),
    ...billing.pendingCharges.map((charge) => ({
      id: `charge-${charge.id}`,
      kind: "PENDING_CHARGE",
      reference: charge.description,
      description: `${charge.description} - not yet invoiced`,
      amount: charge.amount,
      balance: charge.amount,
      date: charge.date,
      issuedAt: null,
      dueDate: null,
      serviceType: "LABORATORY",
      paymentStatus: "PENDING",
      // The laboratory stage this work actually reached.
      fulfilmentStatus: charge.status,
      notes: null,
      doctor: null,
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // What was actually received, taken from the same aggregation the Admin billing
// summary uses. Summing the face value of invoices merely *marked* PAID would
  // ignore partial settlement, so the two screens would disagree.
  const paidTotal = billing.summary.paid;

  return {
    items,
    payments: billing.payments,
    summary: {
      // What the patient is actually shown above: real invoices PLUS the verified
      // lab work that has not been invoiced yet. Reporting only `invoiced` would make
      // this total disagree with the `items` list and with the notice below whenever
      // a lab result is waiting to be billed.
      totalCharges: round(billing.summary.invoiced + billing.summary.pendingChargeTotal),
      chargeCount: billing.invoices.length + billing.pendingCharges.length,
      paidTotal,
      outstanding: billing.summary.outstanding,
      pendingChargeTotal: billing.summary.pendingChargeTotal,
      gatewayConfigured: billing.summary.gatewayConfigured ?? false,
    },
    notice: billing.invoices.length
      ? null
      : "No invoice has been raised for you yet. The amounts below are the published price of laboratory tests already completed for you; they become payable once the hospital raises an invoice.",
  };
};

/* ------------------------------------------------------------- notifications */

const shapeNotification = (row) => ({
  id: row._id,
  type: row.type,
  title: row.title,
  message: row.message,
  entityType: row.entityType || null,
  entityId: row.entityId || null,
  readAt: row.readAt || null,
  read: Boolean(row.readAt),
  createdAt: row.createdAt,
});

const listNotifications = async (patientId, query = {}) => {
  const limit = clampLimit(query.limit, 50, 200);
  const filter = { recipient: patientId };

  if (query.unread === "true" || query.unread === true) filter.readAt = null;
  if (query.read === "true" || query.read === true) filter.readAt = { $ne: null };

  const [rows, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ recipient: patientId, readAt: null }),
  ]);

  return { items: rows.map(shapeNotification), unreadCount };
};

const unreadNotificationCount = async (patientId) =>
  Notification.countDocuments({ recipient: patientId, readAt: null });

/** Ownership is in the query, so another patient's notification id is a 404. */
const markNotificationRead = async (patientId, notificationId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: patientId },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  if (!notification) fail("Notification not found", 404);
  return shapeNotification(notification);
};

const markAllNotificationsRead = async (patientId) => {
  const result = await Notification.updateMany(
    { recipient: patientId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return { updated: result.modifiedCount || 0 };
};

module.exports = {
  // profile
  getProfile,
  updateProfile,
  // dashboard
  getSummary,
  listDoctors,
  // appointments
  listAppointments,
  bookAppointment,
  cancelAppointment,
  listFollowUps,
  getAvailability: appointmentService.listAvailability,
  // clinical
  listConsultations,
  getHistory,
  listPrescriptions,
  getPrescriptionDocument,
  // laboratory
  listLabRequests,
  listLabReports,
  getLabReport,
  // billing
  listPayments,
  // notifications
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
};
