const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");
const LabRequest = require("../models/LabRequest");
const LabReport = require("../models/LabReport");
const LabResult = require("../models/LabResult");
const SampleCollection = require("../models/SampleCollection");
const Payment = require("../models/Payment");
const User = require("../models/User");
const careTeamService = require("./careTeam.service");
const { calculateAge, formatDate } = require("../utils/clinical");

// Reports a patient may see are the RELEASED ones (VERIFIED or APPROVED).
// Imported so the release rule is defined once, in lab.service.
const { RELEASED_REPORT_STATUSES: RELEASED } = require("./lab.service");

/**
 * Patient clinical workspace + medical history (FR-DR-02, section 9).
 *
 * Deliberately NOT a stored `MedicalHistory` table. The SRS requires the history
 * to be a faithful, interconnected record of what actually happened; a
 * denormalised copy would drift the moment a consultation is amended. Instead
 * the timeline is projected on read from the collections that own the real
 * events, so it cannot disagree with them.
 *
 * `summary` is one aggregate round trip; `timeline` is a hard-capped window per
 * event type so opening a patient never pulls their whole life (section 39).
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const PATIENT_FIELDS =
  "name email phone contactNumber address dateOfBirth gender bloodGroup allergies emergencyContactName emergencyContactNumber";

/** Clinical header for the workspace. 404s for an unassigned patient. */
const getPatient = async (doctorId, patientId) => {
  const { patient } = await careTeamService.assertAccess(doctorId, patientId);
  const full = await User.findById(patientId).select(PATIENT_FIELDS).lean();

  const [careTeam, lastConsultation, openPrescriptions, verifiedReports, upcoming] =
    await Promise.all([
      careTeamService.careTeamFor(patientId),
      Consultation.findOne({ patient: patientId })
        .sort({ createdAt: -1 })
        .select("diagnosis consultationNo createdAt status treatmentOutcome")
        .lean(),
      Prescription.countDocuments({ patient: patientId, status: "ISSUED" }),
      LabReport.countDocuments({ patient: patientId, status: { $in: RELEASED } }),
      Appointment.countDocuments({
        patient: patientId,
        status: { $nin: ["CANCELLED", "COMPLETED"] },
        appointmentDate: { $gte: new Date() },
      }),
    ]);

  return {
    id: full._id,
    // A short, non-guessable reference rather than the raw ObjectId, for
    // display on clinical documents.
    reference: `PT-${String(full._id).slice(-6).toUpperCase()}`,
    name: full.name,
    email: full.email,
    contactNumber: full.contactNumber || full.phone || null,
    address: full.address || null,
    dateOfBirth: full.dateOfBirth || null,
    age: calculateAge(full.dateOfBirth),
    gender: full.gender || null,
    bloodGroup: full.bloodGroup || null,
    allergies: full.allergies || null,
    emergencyContact: full.emergencyContactName || full.emergencyContactNumber
      ? { name: full.emergencyContactName || null, number: full.emergencyContactNumber || null }
      : null,
    careTeam,
    summary: {
      lastConsultation: lastConsultation
        ? {
            consultationNo: lastConsultation.consultationNo,
            diagnosis: lastConsultation.diagnosis,
            date: lastConsultation.createdAt,
            status: lastConsultation.status,
            treatmentOutcome: lastConsultation.treatmentOutcome || null,
          }
        : null,
      openPrescriptions,
      verifiedReports,
      upcomingAppointments: upcoming,
    },
  };
};

/**
 * The chronological timeline, as a pure projection.
 *
 * Split from the doctor-facing `getHistory` on purpose: the timeline is a
 * projection over the collections that own the real events, and both the
 * doctor workspace and the administrative patient record need the identical
 * projection. Only the authorisation differs - a doctor must be on the care team,
 * an administrator is authorised by the router's `isAdmin` gate and has authority
 * over every patient in the hospital. Keeping the query in one place is what
 * guarantees an Admin looking at a patient sees exactly what their doctor sees.
 *
 * Each event is a flat `{ type, at, title, detail }` so the frontend can render
 * one ordered list with a switch on `type`, instead of five differently-shaped
 * sections it has to merge itself.
 */
const buildHistory = async (patientId, query = {}) => {
  // The per-type cap bounds the RESPONSE, not the query. MongoDB returns the
  // patient's matching rows for each collection and `recent()` truncates in Node.
  // That is deliberate: the sort key differs per collection (`appointmentDate` for
  // appointments, `issuedAt` for prescriptions, `requestedDate` for lab requests),
  // so the window can only be applied once the rows are known. The client asks for
  // a larger window explicitly via `?limit=`.
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const since = query.since ? new Date(query.since) : null;
  if (since && Number.isNaN(since.getTime())) fail("`since` is not a valid date", 422);

  // Only add the `createdAt` clause when there IS a bound. `createdAt: {}` is
  // not "no filter" to MongoDB - it casts `{}` to a Date and throws.
  const after = since ? { $gte: since } : null;
  const inWindow = (extra = {}) =>
    after ? { patient: patientId, createdAt: after, ...extra } : { patient: patientId, ...extra };
  const includeCancelled = query.includeCancelled === true;
  // `rows` are lean objects, so they need an explicit timestamp field:
  // `new Date(leanRow)` is an Invalid Date and the sort would silently be a
  // no-op, leaving the "most recent N" cap picking whatever MongoDB returned.
  const recent = (rows, at) =>
    [...rows].sort((a, b) => new Date(at(b)) - new Date(at(a))).slice(0, limit);

  const [appointments, consultations, prescriptions, labRequests, reports, samples, payments] = await Promise.all([
    // A medical history is a record of care that ACTUALLY HAPPENED, so retracted
    // work is excluded rather than shown as if it were clinical fact. Each filter is
    // the strictest reading of its own collection's status vocabulary:
    //   - a cancelled / no-show appointment was not a visit
    //   - a cancelled consultation produced no clinical encounter
    //   - a draft prescription was never issued, a cancelled one was withdrawn
    //   - a cancelled lab request was never run
    //   - a report is clinical history only once the laboratory has VERIFIED it,
    //     which is also the rule the patient-facing screens already enforce
    // A DRAFT consultation is still shown: it is real, recorded, in-progress work.
    Appointment.find(inWindow(includeCancelled ? {} : { status: { $nin: ["CANCELLED", "NO_SHOW"] } }))
      .populate("doctor", "name department")
      .lean(),
    Consultation.find(inWindow(includeCancelled ? {} : { status: { $ne: "CANCELLED" } }))
      .populate("doctor", "name department")
      .lean(),
    Prescription.find(inWindow(includeCancelled ? {} : { status: { $ne: "CANCELLED" } }))
      .populate("doctor", "name department")
      .lean(),
    LabRequest.find(inWindow(includeCancelled ? {} : { status: { $ne: "CANCELLED" } }))
      .populate("test", "name testName category")
      .populate("doctor", "name")
      .lean(),
    LabReport.find(inWindow({ status: { $in: RELEASED } }))
      .populate("test", "name testName category")
      .lean(),
    SampleCollection.find(inWindow())
      .populate("test", "name testName")
      .populate("labRequest", "status priority")
      .populate("collectedBy", "name")
      .lean(),
    Payment.find(inWindow())
      .populate("invoice", "invoiceNo")
      .lean(),
  ]);

  const events = [];

  for (const row of recent(appointments, (r) => r.appointmentDate || r.createdAt)) {
    events.push({
      id: row._id,
      type: "APPOINTMENT",
      at: row.appointmentDate || row.createdAt,
      title: `${row.type === "FOLLOW_UP" ? "Follow-up" : "Appointment"} - ${row.status}`,
      subtitle: row.reason || null,
      status: row.status,
      actor: row.doctor?.name || null,
      appointmentNo: row.appointmentNo,
      ref: row.followUpOf || null,
    });
  }

  for (const row of recent(consultations, (r) => r.createdAt)) {
    events.push({
      id: row._id,
      type: "CONSULTATION",
      at: row.createdAt,
      title: row.diagnosis || "Consultation",
      subtitle: [row.clinicalNotes || row.chiefComplaint, row.treatmentOutcome].filter(Boolean).join(" · ") || null,
      status: row.status,
      actor: row.doctor?.name || null,
      consultationNo: row.consultationNo,
      vitals: row.vitals || null,
      treatmentOutcome: row.treatmentOutcome || null,
      prescriptionCount: (row.prescriptions || []).length,
      labRequestCount: (row.labRequests || []).length,
    });
  }

  for (const row of recent(prescriptions, (r) => r.issuedAt || r.createdAt)) {
    events.push({
      id: row._id,
      type: "PRESCRIPTION",
      at: row.issuedAt || row.createdAt,
      // A draft prescription is still included above, so it must say so: without the
      // status a DRAFT reads exactly like an issued one.
      title: `Prescription ${row.prescriptionNo}${row.status === "DRAFT" ? " (draft)" : ""}`,
      subtitle: `${(row.items || []).length} medicine(s)`,
      actor: row.doctor?.name || null,
      prescriptionNo: row.prescriptionNo,
      itemCount: (row.items || []).length,
    });
  }

  for (const row of recent(labRequests, (r) => r.requestedDate || r.createdAt)) {
    events.push({
      id: row._id,
      type: "LAB_REQUEST",
      at: row.requestedDate || row.createdAt,
      title: `${row.test?.name || row.test?.testName || "Laboratory test"} requested`,
      subtitle: row.clinicalNotes || null,
      status: row.status,
      priority: row.priority,
      actor: row.doctor?.name || null,
    });
  }

  for (const row of recent(reports, (r) => r.verifiedAt || r.generatedAt || r.createdAt)) {
    events.push({
      id: row._id,
      type: "LAB_REPORT",
      at: row.verifiedAt || row.generatedAt || row.createdAt,
      title: `${row.test?.name || row.test?.testName || "Laboratory report"} ${row.status}`,
      subtitle: row.remarks || null,
      status: row.status,
      reportId: row.reportId,
      doctorCommentCount: (row.doctorComments || []).length,
    });
  }

  for (const row of recent(samples, (r) => r.collectionTime || r.collectionDate || r.createdAt)) {
    events.push({
      id: row._id,
      type: "SAMPLE_COLLECTION",
      at: row.collectionTime || row.collectionDate || row.createdAt,
      title: `Sample ${row.sampleId} collected`,
      subtitle: [row.test?.name || row.test?.testName, row.sampleType].filter(Boolean).join(" · ") || null,
      status: row.status,
      actor: row.collectedBy?.name || null,
      sampleId: row.sampleId,
      labRequestId: row.labRequest?._id || row.labRequest || null,
    });
  }

  for (const row of recent(payments, (r) => r.paidAt || r.createdAt)) {
    events.push({
      id: row._id,
      type: "PAYMENT",
      at: row.paidAt || row.createdAt,
      title: `Payment ${row.paymentNo}`,
      subtitle: `${row.amount} · ${row.method}${row.invoice?.invoiceNo ? ` · ${row.invoice.invoiceNo}` : ""}`,
      status: row.status,
      paymentNo: row.paymentNo,
      invoiceNo: row.invoice?.invoiceNo || null,
    });
  }

  events.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    events,
    counts: {
      appointments: appointments.length,
      consultations: consultations.length,
      prescriptions: prescriptions.length,
      labRequests: labRequests.length,
      labReports: reports.length,
      sampleCollections: samples.length,
      payments: payments.length,
    },
  };
};

/**
 * Doctor-facing entry point.
 *
 * The care-team check happens here and nowhere else, so every projection below
 * stays a pure read. A doctor who is not on this patient's care team gets a 403
 * before a single record is fetched.
 */
const getHistory = async (doctorId, patientId, query = {}) => {
  await careTeamService.assertAccess(doctorId, patientId);
  return buildHistory(patientId, query);
};

/**
 * The doctor's own consultation notes for one patient, used by the previous-
 * consultations tab (section 19). Kept read-only.
 */
const getConsultations = async (doctorId, patientId, query = {}) => {
  await careTeamService.assertAccess(doctorId, patientId);

  const filter = { doctor: doctorId, patient: patientId };
  if (query.status) filter.status = String(query.status).toUpperCase();

  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const [items, total] = await Promise.all([
    Consultation.find(filter)
      .populate("prescriptions", "prescriptionNo items issuedAt")
      .populate("labRequests")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Consultation.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

module.exports = { getPatient, getHistory, buildHistory, getConsultations, PATIENT_FIELDS, formatDate };
