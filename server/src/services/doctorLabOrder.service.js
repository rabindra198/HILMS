const mongoose = require("mongoose");
const { ROLES } = require("../config/roles");
const LabRequest = require("../models/LabRequest");
const LabTest = require("../models/LabTest");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const consultationService = require("./consultation.service");
const careTeamService = require("./careTeam.service");
const auditService = require("./audit.service");
const { notifyLabStaff } = require("./lab.service");

const fail = (message, statusCode = 422) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const validId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(value)) fail(`A valid ${label} is required`);
  return value;
};

const getWorkspace = async (doctorId) => {
  // The care team is a ceiling, not a suggestion: a doctor may only order tests
  // for patients an Admin has assigned to them. Listing every active patient in
  // the hospital here would hand each doctor the whole patient directory.
  const patients = await careTeamService.assignedPatients(doctorId);

  const [tests, requests] = await Promise.all([
    LabTest.find({ isActive: true }).select("name testName category sampleType price").sort({ category: 1, name: 1 }).lean(),
    LabRequest.find({ doctor: doctorId })
      .populate("patient", "name email")
      .populate("test", "name testName category sampleType")
      .populate("appointment", "appointmentNo appointmentDate type status")
      .sort({ requestedDate: -1 })
      .limit(100)
      .lean(),
  ]);
  return { patients, tests, requests };
};

/**
 * FR-DR-06 requires the appointment to be stored on the request, so the link
 * between "why this test was ordered" and the visit that prompted it survives.
 * The appointment is only accepted when it genuinely belongs to this doctor and
 * this patient, otherwise the field would be a free-text claim about any visit.
 */
const resolveAppointment = async ({ appointmentId, doctorId, patientId }) => {
  if (!appointmentId) return undefined;
  const id = validId(appointmentId, "appointment");
  const appointment = await Appointment.findOne({
    _id: id,
    doctor: doctorId,
    patient: patientId,
  }).select("_id");
  if (!appointment) fail("Appointment not found", 404);
  return appointment._id;
};

/**
 * Same rule for the consultation: it is only accepted when it genuinely belongs to
 * this doctor and this patient. Without that check the field would be a free-text
 * claim about someone else's consultation, and the clinical timeline it feeds would
 * be wrong.
 */
const resolveConsultation = async ({ consultationId, doctorId, patientId }) => {
  if (!consultationId) return undefined;
  const id = validId(consultationId, "consultation");
  const consultation = await Consultation.findOne({
    _id: id,
    doctor: doctorId,
    patient: patientId,
  }).select("_id");
  if (!consultation) fail("Consultation not found", 404);
  return consultation._id;
};

const createRequest = async (payload = {}, doctorId) => {
  const patientId = validId(payload.patient, "patient");
  const testId = validId(payload.test, "test");
  const priority = String(payload.priority || "ROUTINE").trim().toUpperCase();
  if (!["ROUTINE", "URGENT", "STAT"].includes(priority)) {
    fail("Priority must be ROUTINE, URGENT, or STAT");
  }

  const clinicalNotes = String(payload.clinicalNotes || "").trim();
  if (clinicalNotes.length > 1000) fail("Clinical notes must be 1000 characters or fewer");

  // Ownership check first. Without it any authenticated doctor could order a
  // test for any patient in the hospital; `assertAccess` also rejects revoked
  // assignments, and answers 404 so the endpoint is not a patient-id oracle.
  const { patient } = await careTeamService.assertAccess(doctorId, patientId);

  const [test, doctor, appointmentId, consultationId] = await Promise.all([
    LabTest.findOne({ _id: testId, isActive: true }).select("_id price"),
    // Fetched so the audit trail names who ordered the request. An audit row with
    // a bare id is not actionable six months later.
    User.findOne({ _id: doctorId, role: ROLES.DOCTOR }).select("email role"),
    resolveAppointment({ appointmentId: payload.appointment, doctorId, patientId: patient._id }),
    resolveConsultation({ consultationId: payload.consultation, doctorId, patientId: patient._id }),
  ]);
  if (!test) fail("Active laboratory test not found", 404);

  const request = await LabRequest.create({
    patient: patient._id,
    doctor: doctorId,
    appointment: appointmentId,
    consultation: consultationId,
    test: test._id,
    // The catalogue price at the moment of ordering. Billing reads the live
    // LabTest.price, so without this snapshot a later reprice would silently
    // change what an already-completed test is said to cost on the patient's
    // unpaid-charge list.
    priceSnapshot: test.price,
    priority,
    clinicalNotes,
    status: "PENDING",
  });

  // The forward link alone would leave the consultation timeline empty, so the
  // request is also attached to the consultation that prompted it. Best effort: a
  // failure to write the back-link must not lose the request the doctor ordered.
  if (consultationId) {
    await consultationService.attachLabRequest(consultationId, request._id);
  }

  const populated = await LabRequest.findById(request._id)
    .populate("patient", "name email")
    .populate("doctor", "name email")
    .populate("test", "name testName category sampleType")
    .populate("appointment", "appointmentNo appointmentDate type status");

  const testLabel = populated.test?.name || populated.test?.testName || "laboratory test";

  // SRS 8.1: a submitted request must reach the laboratory, not sit unseen in
  // the queue. Best effort, so a notification failure cannot lose the request.
  await notifyLabStaff({
    type: "LAB_REQUEST_CREATED",
    title: "New laboratory request",
    message: `A new ${populated.priority === "ROUTINE" ? "" : `${populated.priority.toLowerCase()} `}laboratory request for ${testLabel} has been submitted for ${populated.patient?.name}.`,
    entityType: "LabRequest",
    entityId: populated._id,
  });

  await auditService.record({
    action: "LAB_REQUEST_CREATED",
    actor: {
      _id: doctorId,
      email: doctor?.email,
      role: doctor?.role || ROLES.DOCTOR,
    },
    targetType: "LabRequest",
    targetId: populated._id,
    metadata: { priority: populated.priority, test: String(populated.test?._id || populated.test), patient: String(populated.patient?._id || populated.patient) },
  });

  return populated;
};

module.exports = { getWorkspace, createRequest };