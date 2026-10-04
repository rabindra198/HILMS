const Consultation = require("../models/Consultation");
const Appointment = require("../models/Appointment");
const LabRequest = require("../models/LabRequest");
const Prescription = require("../models/Prescription");
const auditService = require("./audit.service");
const careTeamService = require("./careTeam.service");
const notificationService = require("./notification.service");
const appointmentService = require("./appointment.service");
const { withDuplicateRetry } = require("../utils/sequence");

/**
 * Consultations (FR-DR-02, FR-DR-08).
 *
 * A consultation is created IN_PROGRESS from the consultation workspace and
 * completed once. Vitals are normalised here rather than in the validator
 * because BMI is derived - a client-supplied BMI is ignored, never trusted.
 *
 * Once COMPLETED the clinical narrative fields are frozen. Section 19 asks for
 * immutable, auditable history: a doctor can still append a prescription or a
 * lab order to a completed encounter (that is continuing treatment, FR-DR-08),
 * but cannot silently rewrite what they previously diagnosed.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const { PATIENT_FIELDS, DOCTOR_FIELDS } = appointmentService;

/** Fields a doctor may edit. Deliberately excludes patient/doctor/status. */
const EDITABLE_FIELDS = [
  "chiefComplaint",
  "symptoms",
  "clinicalNotes",
  "diagnosis",
  "treatmentPlan",
  "treatmentOutcome",
  "doctorNotes",
];

/** Narrative fields that freeze when the consultation completes. */
const FROZEN_ON_COMPLETE = [
  "chiefComplaint",
  "symptoms",
  "clinicalNotes",
  "diagnosis",
  "treatmentPlan",
];

/** Copies only the vital keys that were actually supplied, dropping empties. */
const normalizeVitals = (input) => {
  if (!input || typeof input !== "object") return null;

  const numeric = [
    "bloodPressureSystolic",
    "bloodPressureDiastolic",
    "heartRate",
    "temperature",
    "respiratoryRate",
    "spo2",
    "weight",
    "height",
  ];

  const vitals = {};
  for (const key of numeric) {
    if (input[key] === undefined || input[key] === null || input[key] === "") continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value)) fail(`${key} must be a number`, 422);
    vitals[key] = value;
  }

  if (input.notes) vitals.notes = String(input.notes).trim().slice(0, 500);
  if (input.flag) vitals.flag = input.flag;

  // A completely empty vitals object would render an empty Vitals card; store
  // null instead so the UI can tell "not taken" from "taken, nothing abnormal".
  return Object.keys(vitals).length ? vitals : null;
};

/** BMI from height (cm) and weight (kg), or null when either is missing. */
const calculateBmi = (vitals) => {
  if (!vitals?.height || !vitals?.weight) return null;
  const metres = vitals.height / 100;
  if (!metres) return null;
  return Math.round((vitals.weight / (metres * metres)) * 10) / 10;
};

const attachVitals = (consultation, vitals) => {
  if (!vitals) return;

  const bmi = calculateBmi(vitals);
  if (bmi !== null) vitals.bmi = bmi;

  if (consultation.vitals) {
    // Merge so the client can PATCH a single reading without resending the rest.
    consultation.vitals.set({ ...consultation.vitals.toObject(), ...vitals });
  } else {
    consultation.vitals = vitals;
  }
};

/** Creates a consultation, optionally against one of the doctor's appointments. */
const create = async (payload, doctorId, actor) => {
  const { patient, appointment, vitals, diagnosis, chiefComplaint } = payload;

  const { patient: patientDoc } = await careTeamService.assertAccess(doctorId, patient);

  if (!diagnosis || !String(diagnosis).trim()) {
    fail("A diagnosis is required to open a consultation", 422);
  }
  if (!chiefComplaint || !String(chiefComplaint).trim()) {
    fail("A chief complaint is required to open a consultation", 422);
  }

  let appointmentDoc = null;
  if (appointment) {
    appointmentDoc = await Appointment.findOne({
      _id: appointment,
      doctor: doctorId,
      patient: patientDoc._id,
    }).select("_id appointmentNo status");
    if (!appointmentDoc) fail("Appointment not found", 404);

    // Starting a consultation for a cancelled/no-show visit would put a real
    // clinical record against a visit the hospital already voided.
    if (["CANCELLED", "NO_SHOW"].includes(appointmentDoc.status)) {
      fail(`Cannot start a consultation for a ${appointmentDoc.status.toLowerCase()} appointment`, 409);
    }
  }

  const consultation = await withDuplicateRetry(async () =>
    Consultation.create({
      consultationNo: await appointmentService.nextConsultationNo(),
      patient: patientDoc._id,
      doctor: doctorId,
      appointment: appointmentDoc?._id,
      chiefComplaint,
      diagnosis,
      status: "IN_PROGRESS",
      startedAt: new Date(),
    })
  );

  attachVitals(consultation, normalizeVitals(vitals));

  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined) consultation[field] = payload[field];
  }

  await consultation.save();

  // Move the linked appointment into the consultation so the day's list and the
  // history timeline agree without the doctor touching the appointment screen.
  if (appointmentDoc && appointmentDoc.status !== "IN_CONSULTATION") {
    await appointmentService.updateStatus(appointmentDoc._id, doctorId, "IN_CONSULTATION", actor).catch(
      () => {}
    );
  }

  await auditService.record({
    action: "CONSULTATION_CREATED",
    actor: actor || { _id: doctorId },
    targetType: "Consultation",
    targetId: consultation._id,
    targetEmail: patientDoc.email,
    metadata: {
      consultationNo: consultation.consultationNo,
      diagnosis,
      appointmentNo: appointmentDoc?.appointmentNo || null,
    },
  });

  return consultation.populate([
    { path: "patient", select: PATIENT_FIELDS },
    { path: "doctor", select: DOCTOR_FIELDS },
  ]);
};

const list = async (doctorId, query = {}) => {
  const filter = { doctor: doctorId };

  if (query.patient) {
    await careTeamService.assertAccess(doctorId, query.patient);
    filter.patient = query.patient;
  }
  if (query.status) filter.status = String(query.status).toUpperCase();

  const patientIds = query.patient ? null : await careTeamService.assignedPatientIds(doctorId);
  if (!query.patient) {
    if (!patientIds.length) return { items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } };
    filter.patient = { $in: patientIds };
  }

  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    filter.$or = [{ diagnosis: regex }, { clinicalNotes: regex }, { consultationNo: regex }];
  }

  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const [items, total] = await Promise.all([
    Consultation.find(filter)
      .populate("patient", PATIENT_FIELDS)
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

const getOne = async (doctorId, consultationId) => {
  const consultation = await Consultation.findOne({ _id: consultationId, doctor: doctorId })
    .populate("patient", PATIENT_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .populate("appointment", "appointmentNo appointmentDate type status")
    .populate("prescriptions", "prescriptionNo items issuedAt status")
    .populate({
      path: "labRequests",
      populate: [
        { path: "test", select: "name category sampleType" },
      ],
    })
    .lean();

  if (!consultation) fail("Consultation not found", 404);
  await careTeamService.assertAccess(doctorId, consultation.patient._id);
  return consultation;
};

/**
 * PATCH. `allowClinicalEdit` is the escape hatch for a genuine correction: the
 * caller must pass an explicit reason, which is recorded in the audit log, so a
 * completed record can still be fixed without making the edit silent.
 */
const update = async (doctorId, consultationId, payload, actor) => {
  const consultation = await Consultation.findOne({ _id: consultationId, doctor: doctorId });
  if (!consultation) fail("Consultation not found", 404);
  await careTeamService.assertAccess(doctorId, consultation.patient);

  const wantsClinicalEdit =
    payload.allowClinicalEdit === true || payload.allowClinicalEdit === "true";

  if (consultation.status === "COMPLETED" && !wantsClinicalEdit) {
    const touched = FROZEN_ON_COMPLETE.filter((field) => payload[field] !== undefined);
    if (touched.length) {
      fail(
        "This consultation is complete. Its clinical notes and diagnosis are permanent; record a new consultation or a treatment outcome instead.",
        409
      );
    }
  }

  if (wantsClinicalEdit) {
    const reason = String(payload.editReason || "").trim();
    if (reason.length < 10) {
      fail("Amending a completed consultation requires a reason of at least 10 characters", 422);
    }
  }

  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined) consultation[field] = payload[field];
  }

  if (payload.vitals !== undefined) {
    attachVitals(consultation, normalizeVitals(payload.vitals));
  }

  await consultation.save();

  await auditService.record({
    action: "CONSULTATION_UPDATED",
    actor: actor || { _id: doctorId },
    targetType: "Consultation",
    targetId: consultation._id,
    metadata: {
      consultationNo: consultation.consultationNo,
      fields: Object.keys(payload).filter(
        (key) => EDITABLE_FIELDS.includes(key) || key === "vitals"
      ),
      amendedCompletedRecord: wantsClinicalEdit,
      editReason: payload.editReason || null,
    },
  });

  return consultation;
};

/** Completes a consultation and closes the linked appointment in one step. */
const complete = async (doctorId, consultationId, payload = {}, actor) => {
  const consultation = await Consultation.findOne({ _id: consultationId, doctor: doctorId });
  if (!consultation) fail("Consultation not found", 404);
  await careTeamService.assertAccess(doctorId, consultation.patient);

  if (consultation.status === "COMPLETED") {
    fail("This consultation is already complete", 409);
  }

  if (payload.diagnosis !== undefined) consultation.diagnosis = payload.diagnosis;
  if (payload.treatmentPlan !== undefined) consultation.treatmentPlan = payload.treatmentPlan;
  if (payload.treatmentOutcome !== undefined) consultation.treatmentOutcome = payload.treatmentOutcome;
  if (payload.clinicalNotes !== undefined) consultation.clinicalNotes = payload.clinicalNotes;
  if (payload.vitals !== undefined) attachVitals(consultation, normalizeVitals(payload.vitals));

  if (!consultation.diagnosis || !String(consultation.diagnosis).trim()) {
    fail("A diagnosis is required before a consultation can be completed", 422);
  }

  consultation.status = "COMPLETED";
  consultation.completedAt = new Date();
  await consultation.save();

  if (consultation.appointment) {
    // Walks the legal status path instead of jumping straight to COMPLETED, so
    // a consultation completed without the doctor ever pressing "Start" does not
    // leave its appointment stuck at SCHEDULED.
    await appointmentService
      .completeForConsultation(consultation.appointment, doctorId, actor)
      .catch(() => {
        // The consultation is the clinical record and is already saved; a
        // mismatched appointment must not roll it back. It stays open and is
        // visible on the doctor's dashboard to correct.
      });
  }

  await auditService.record({
    action: "CONSULTATION_COMPLETED",
    actor: actor || { _id: doctorId },
    targetType: "Consultation",
    targetId: consultation._id,
    metadata: {
      consultationNo: consultation.consultationNo,
      diagnosis: consultation.diagnosis,
      treatmentOutcomeRecorded: Boolean(consultation.treatmentOutcome),
    },
  });

  // The consultation is finished and its outcome is the thing the patient is waiting
  // on. Best-effort, so a notification fault cannot fail a completed encounter.
  notificationService
    .notifyUser({
      recipient: consultation.patient,
      type: "CONSULTATION_COMPLETED",
      title: "Consultation completed",
      message: `Your consultation ${consultation.consultationNo} has been completed. The outcome is available on your consultation record.`,
      entityType: "Consultation",
      entityId: consultation._id,
    })
    .catch(() => {});

  return consultation;
};

/** Links a prescription back onto the consultation, for the timeline. */
const attachPrescription = async (consultationId, prescriptionId) => {
  await Consultation.updateOne(
    { _id: consultationId },
    { $addToSet: { prescriptions: prescriptionId } }
  );
};

/** Links a lab request back onto the consultation, for the timeline. */
const attachLabRequest = async (consultationId, labRequestId) => {
  await Consultation.updateOne(
    { _id: consultationId },
    { $addToSet: { labRequests: labRequestId } }
  );
};

module.exports = {
  create,
  list,
  getOne,
  update,
  complete,
  attachPrescription,
  attachLabRequest,
  normalizeVitals,
  calculateBmi,
  EDITABLE_FIELDS,
};
