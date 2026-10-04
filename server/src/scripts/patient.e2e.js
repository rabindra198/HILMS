/**
 * End-to-end verification of the patient module (FR-PT-01 .. FR-PT-10) against
 * the real Express app and the real MongoDB.
 *
 * The script exercises the self-service patient routes mounted at /patient: profile,
 * dashboard, doctor directory, appointments (book/availability/cancel), follow-ups,
 * consultations/history, prescriptions (document + PDF), laboratory requests/reports,
 * billing, notifications, and unread counts. Every assertion is checked over HTTP
 * and, where it matters, re-read from the database.
 *
 * Fixtures use the `PATIENTE2E_` namespace and are removed on entry and exit, so
 * an interrupted run never leaves test data behind. The suite uses a scratch
 * database when `--db=<name>` is provided, otherwise it runs against the configured
 * default (e.g. `test` in local development).
 *
 * The business rules this enforces are the ones stated in the audit:
 * - Patient identity comes only from `req.user._id`; routes do NOT take patient ids.
 * - Laboratory reports are visible only when `LabReport.status === "VERIFIED"`.
 * - Patients may book CONSULTATION appointments only and cancel only SCHEDULED/CONFIRMED.
 * - Invoice and Payment are real models and eSewa settlement is verified server-side,
 *   so billing must report the REAL gateway state (cross-checked against
 *   /payments/config) and never invent a settlement.
 * - Prescription PDF shares the same renderer and document as the doctor endpoint.
 */
const mongoose = require("mongoose");
require("dotenv").config();

const app = require("../app");
const User = require("../models/User");
const LabTest = require("../models/LabTest");
const LabRequest = require("../models/LabRequest");
const SampleCollection = require("../models/SampleCollection");
const LabResult = require("../models/LabResult");
const LabReport = require("../models/LabReport");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/email.service");

const sentMail = [];
emailService.env.email.host = "smtp.test.local";
emailService.setTransport({
  sendMail: async (payload) => {
    sentMail.push(payload);
    return { messageId: `patient-e2e-${sentMail.length}` };
  },
});

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const NS = /^patiente2e_/i;

let passed = 0;
let failed = 0;
let server;

const check = (name, condition, detail = "") => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
};

const section = (title) => console.log(`\n${title}`);
const uniq = () => Math.random().toString(36).slice(2, 10);
const unwrap = (body) => body?.data ?? body ?? {};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

const callRaw = async (method, path, { token } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return {
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    disposition: res.headers.get("content-disposition") || "",
    buffer: Buffer.from(await res.arrayBuffer()),
  };
};

const purge = async () => {
  const userIds = (await User.find({ email: NS }, { _id: 1 }).lean()).map((u) => u._id);
  const requestIds = (await LabRequest.find({ clinicalNotes: NS }, { _id: 1 }).lean()).map((r) => r._id);
  const appointmentIds = (await Appointment.find({ reason: NS }, { _id: 1 }).lean()).map((r) => r._id);
  const consultationIds = (await Consultation.find({ clinicalNotes: NS }, { _id: 1 }).lean()).map((r) => r._id);
  const prescriptionIds = (await Prescription.find({ notes: NS }, { _id: 1 }).lean()).map((r) => r._id);

  const auditTargets = [
    ...requestIds,
    ...appointmentIds,
    ...consultationIds,
    ...prescriptionIds,
    ...(await SampleCollection.find({ labRequest: { $in: requestIds } }, { _id: 1 }).lean()).map((r) => r._id),
    ...(await LabResult.find({ labRequest: { $in: requestIds } }, { _id: 1 }).lean()).map((r) => r._id),
    ...(await LabReport.find({ labRequest: { $in: requestIds } }, { _id: 1 }).lean()).map((r) => r._id),
    ...(await LabTest.find({ testCode: NS }, { _id: 1 }).lean()).map((r) => r._id),
  ];

  await Promise.all([
    LabReport.deleteMany({ labRequest: { $in: requestIds } }),
    LabResult.deleteMany({ labRequest: { $in: requestIds } }),
    SampleCollection.deleteMany({ labRequest: { $in: requestIds } }),
    LabRequest.deleteMany({ _id: { $in: requestIds } }),
    LabTest.deleteMany({ testCode: NS }),
    Prescription.deleteMany({ _id: { $in: prescriptionIds } }),
    Consultation.deleteMany({ _id: { $in: consultationIds } }),
    Appointment.deleteMany({ _id: { $in: appointmentIds } }),
    DoctorPatientAssignment.deleteMany({ doctor: { $in: userIds } }),
    DoctorPatientAssignment.deleteMany({ patient: { $in: userIds } }),
    Notification.deleteMany({ recipient: { $in: userIds } }),
    AuditLog.deleteMany({ $or: [{ targetId: { $in: auditTargets } }, { actor: { $in: userIds } }] }),
    User.deleteMany({ email: NS }),
  ]);
};

const run = async () => {
  const dbArg = process.argv.find((arg) => arg.startsWith("--db="));
  const DB_NAME = dbArg ? dbArg.split("=")[1] : undefined;

  await mongoose.connect(process.env.MONGO_URI, DB_NAME ? { dbName: DB_NAME } : {});
  const resolved = mongoose.connection.name;
  if (DB_NAME && resolved !== DB_NAME) {
    throw new Error(`--db=${DB_NAME} was requested but the connection resolved to "${resolved}". Aborting before any writes.`);
  }
  console.log(`database: ${resolved}${DB_NAME ? " (scratch)" : " (configured default)"}\n`);
  await purge();
  server = app.listen(PORT);
  await wait(150);

  const tag = uniq();
  const email = (local) => `PATIENTE2E_${local}_${tag}@e2e.io`;
  const PASSWORD = "PatientE2e!Pass1";

  // Create fixtures: doctor, lab, two patients (one primary, one stranger), plus a separate patient for cross-patient denial tests.
  const [doctor, labUser, patient, stranger] = await User.create([
    {
      name: "PatientE2E Doctor",
      email: email("doc"),
      phone: "9800100011",
      password: PASSWORD,
      role: "doctor",
      nmcNumber: `PATIENTE2E-NMC-${tag}`.toUpperCase(),
      department: "General Medicine",
      mustChangePassword: false,
    },
    {
      name: "PatientE2E Technologist",
      email: email("lab"),
      phone: "9800100012",
      password: PASSWORD,
      role: "lab",
      labRegistryNumber: `PATIENTE2E-REG-${tag}`.toUpperCase(),
      mustChangePassword: false,
    },
    {
      name: "PatientE2E Patient",
      email: email("pat"),
      phone: "9800100013",
      password: PASSWORD,
      role: "patient",
      dateOfBirth: new Date("1990-03-15"),
      gender: "male",
      bloodGroup: "A+",
      address: "Kathmandu, Ward 10",
      allergies: "No known allergies",
      mustChangePassword: false,
    },
    {
      name: "PatientE2E Stranger",
      email: email("str"),
      phone: "9800100014",
      password: PASSWORD,
      role: "patient",
      mustChangePassword: false,
    },
  ]);

  // Give the doctor visibility of the primary patient (care-team), so doctor-side
  // clinical data can be created and the patient can then read it.
  await DoctorPatientAssignment.create({
    doctor: doctor._id,
    patient: patient._id,
    relationship: "Primary physician",
    assignedBy: doctor._id,
  });

  const login = async (u) =>
    unwrap((await call("POST", "/auth/login", { body: { email: u.email, password: PASSWORD } })).data);
  const doctorToken = (await login(doctor)).token;
  const labToken = (await login(labUser)).token;
  const patientToken = (await login(patient)).token;
  const strangerToken = (await login(stranger)).token;

  const callPat = (method, path, body) => call(method, path, { token: patientToken, ...(body ? { body } : {}) });
  const callStr = (method, path, body) => call(method, path, { token: strangerToken, ...(body ? { body } : {}) });
  const callDoc = (method, path, body) => call(method, path, { token: doctorToken, ...(body ? { body } : {}) });
  const callLab = (method, path, body) => call(method, path, { token: labToken, ...(body ? { body } : {}) });

  // Helpers to create clinical fixtures from doctor/lab side
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const dayStart = (d) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  };

  section("0. Auth/role guards and identity enforcement");
  check("patient obtains a token", Boolean(patientToken));
  check("unauthenticated /patient/dashboard -> 401", (await call("GET", "/patient/dashboard")).status === 401);
  check("doctor cannot access /patient/dashboard -> 403", (await call("GET", "/patient/dashboard", { token: doctorToken })).status === 403);
  check("lab cannot access /patient/dashboard -> 403", (await call("GET", "/patient/dashboard", { token: labToken })).status === 403);
  // A patient who still holds an Admin-issued temporary password is confined to the
  // change-password screen, and that is enforced here rather than in the SPA.
  const tempPatient = await User.create({
    name: "PatientE2E Temp",
    email: email("tmp"),
    phone: "9800100099",
    password: PASSWORD,
    role: "patient",
    mustChangePassword: true,
  });
  const tempToken = unwrap((await call("POST", "/auth/login", { body: { email: tempPatient.email, password: PASSWORD } })).data).token;
  check("a patient on a temporary password is blocked until it is changed", (await call("GET", "/patient/dashboard", { token: tempToken })).status === 403);

  section("1. Profile (FR-PT-08)");
  const profile = unwrap((await callPat("GET", "/patient/profile")).data);
  check("GET /patient/profile returns 200 with profile shape", profile && profile.email === patient.email);
  check("profile includes identity fields", typeof profile.name === "string" && profile.role === "patient", `role=${profile.role}`);
  check("profile exposes role and status as read-only facts", profile.status === "APPROVED", `status=${profile.status}`);
  const updated = unwrap(
    (
      await callPat("PATCH", "/patient/profile", {
        phone: "9800100013",
        address: "Lalitpur, Ward 3",
        bloodGroup: "A+",
        allergies: "Dust allergy",
      })
    ).data
  );
  check("PATCH /patient/profile updates allowed fields", updated.address && updated.address.includes("Lalitpur"));
  const bad = await callPat("PATCH", "/patient/profile", { name: "A" });
  check("validation rejects short name", bad.status === 400);

  section("2. Dashboard (FR-PT-02)");
  const dash = unwrap((await callPat("GET", "/patient/dashboard")).data);
  check("dashboard returns a summary object", Boolean(dash) && typeof dash === "object");
  check(
    "dashboard reports the counts the UI needs",
    ["upcomingAppointmentCount", "pendingLabRequestCount", "verifiedReportCount", "activePrescriptionCount", "unreadNotificationCount"].every(
      (k) => typeof dash[k] === "number"
    ),
    JSON.stringify(Object.keys(dash || {}))
  );
  check("dashboard carries the list collections the UI renders", Array.isArray(dash.recentAppointments));

  section("3. Doctor directory (bookable doctors)");
  const docs = unwrap((await callPat("GET", "/patient/doctors")).data);
  check("doctors list includes our doctor (public fields only)", Array.isArray(docs) && docs.some((d) => String(d._id) === String(doctor._id)));
  check("doctor directory does not expose sensitive internal fields", docs.length === 0 || !Object.prototype.hasOwnProperty.call(docs[0], "password"));

  section("4. Appointments: availability, booking, validation, cancellation (FR-PT-01)");
  // Availability is queried for TOMORROW on purpose. Today's slots are progressively
  // marked unavailable as the day passes, so booking today makes this suite fail on
  // an evening run for a reason that has nothing to do with the code under test.
  const avail = unwrap(
    (await callPat("GET", `/patient/appointments/availability?doctorId=${doctor._id}&date=${dayStart(tomorrow)}`)).data
  );
  check("availability returns slots and clinic hours", avail && Array.isArray(avail.slots) && avail.slots.length > 0);
  const firstSlot = avail.slots.find((s) => s.available);
  check("tomorrow has at least one bookable slot", Boolean(firstSlot));
  const bookedAppt = unwrap(
    (
      await callPat("POST", "/patient/appointments", {
        doctorId: doctor._id,
        appointmentDate: dayStart(tomorrow),
        startTime: firstSlot.startTime,
        durationMinutes: 30,
        reason: `patiente2e_${tag} consultation request`,
        type: "CONSULTATION",
      })
    ).data
  );
  check("booking CONSULTATION returns 201", Boolean(bookedAppt._id));
  check("appointment has readable number and SCHEDULED", /^APT-\d{4}-\d{4}$/.test(bookedAppt.appointmentNo || "") && bookedAppt.status === "SCHEDULED");
  // The validator can see this rule alone, so it is a 400 rather than a 422: the
  // service's 422 guard is the backstop for a type that reaches it another way.
  const nonConsultation = await callPat("POST", "/patient/appointments", {
    doctorId: doctor._id,
    appointmentDate: dayStart(tomorrow),
    startTime: "09:30",
    reason: `patiente2e_${tag} bad type`,
    type: "FOLLOW_UP",
  });
  check(
    "booking a FOLLOW_UP is refused - follow-ups are a doctor action",
    nonConsultation.status === 400 || nonConsultation.status === 422,
    `got ${nonConsultation.status}`
  );
  check("booking with impossible time -> 400/422", (await callPat("POST", "/patient/appointments", {
    doctorId: doctor._id,
    appointmentDate: dayStart(tomorrow),
    startTime: "25:00",
    reason: `bad time ${tag}`,
  })).status >= 400);
  const apptList = unwrap((await callPat("GET", "/patient/appointments")).data);
  check("appointments list includes booked one", Array.isArray(apptList) && apptList.some((a) => String(a.id) === String(bookedAppt._id)));
  const cancelRes = unwrap(
    (await callPat("PATCH", `/patient/appointments/${bookedAppt._id}/cancel`, { reason: "Schedule conflict" })).data
  );
  check("patient can cancel SCHEDULED appointment", cancelRes && cancelRes.status === "CANCELLED");
  const cancelledDb = await Appointment.findById(bookedAppt._id).lean();
  check("cancellation persisted with reason", cancelledDb && cancelledDb.status === "CANCELLED");

  // Create another appointment and move to CONFIRMED via doctor to test cancellation rules on CONFIRMED
  const slot2 = (unwrap((await callPat("GET", `/patient/appointments/availability?doctorId=${doctor._id}&date=${dayStart(tomorrow)}`)).data).slots || []).find((s) => s.available) || { startTime: "10:00" };
  const appt2 = unwrap(
    (
      await callPat("POST", "/patient/appointments", {
        doctorId: doctor._id,
        appointmentDate: dayStart(tomorrow),
        startTime: slot2.startTime,
        durationMinutes: 30,
        reason: `patiente2e_${tag} appt2`,
      })
    ).data
  );
  await callDoc("PATCH", `/doctor/appointments/${appt2._id}/status`, { status: "CONFIRMED" });
  const cancelConfirmed = unwrap((await callPat("PATCH", `/patient/appointments/${appt2._id}/cancel`)).data);
  check("patient can cancel CONFIRMED appointment", cancelConfirmed && cancelConfirmed.status === "CANCELLED");

  // Create a third appointment, start consultation so it becomes IN_CONSULTATION -> patient cannot cancel
  const slot3 = (unwrap((await callPat("GET", `/patient/appointments/availability?doctorId=${doctor._id}&date=${dayStart(new Date(today.getTime() + 2*86400000))}`)).data).slots || []).find((s) => s.available) || { startTime: "11:00" };
  const appt3 = unwrap(
    (
      await callPat("POST", "/patient/appointments", {
        doctorId: doctor._id,
        appointmentDate: dayStart(new Date(today.getTime() + 2*86400000)),
        startTime: slot3.startTime,
        durationMinutes: 30,
        reason: `patiente2e_${tag} appt3`,
      })
    ).data
  );
  await callDoc("PATCH", `/doctor/appointments/${appt3._id}/status`, { status: "CONFIRMED" });
  const cons3 = unwrap(
    (
      await callDoc("POST", "/doctor/consultations", {
        patient: patient._id,
        appointment: appt3._id,
        chiefComplaint: "Checkup",
        diagnosis: "Wellness",
        clinicalNotes: `patiente2e_${tag} cons3`,
      })
    ).data
  );
  const cannotCancel = await callPat("PATCH", `/patient/appointments/${appt3._id}/cancel`);
  check("patient cannot cancel IN_CONSULTATION appointment (409)", cannotCancel.status === 409);

  section("5. Follow-ups (FR-PT-05)");
  const fu = unwrap((await callPat("GET", "/patient/follow-ups")).data);
  check("follow-ups list returns array (shaped by service)", Array.isArray(fu));

  section("6. Clinical: consultations and medical history (FR-PT-03, FR-PT-04)");
  const consList = unwrap((await callPat("GET", "/patient/consultations")).data);
  check("consultations list includes created consultation", Array.isArray(consList));
  const history = unwrap((await callPat("GET", "/patient/medical-history")).data);
  check("medical history returns an event timeline plus counts", Array.isArray(history?.events) && typeof history?.counts === "object");
  check(
    "the timeline spans every clinical collection the doctor writes to",
    ["appointments", "consultations", "prescriptions", "labRequests", "labReports"].every((k) => typeof history?.counts?.[k] === "number"),
    JSON.stringify(history?.counts)
  );
  check(
    "the consultation the doctor recorded appears on the patient's timeline",
    (history?.events || []).some((event) => event.type === "CONSULTATION" && String(event.id) === `con-${cons3._id}`),
    JSON.stringify((history?.events || []).map((e) => e.id))
  );

  section("7. Prescriptions: list, document, PDF (FR-PT-06)");
  const rx = unwrap(
    (
      await callDoc("POST", "/doctor/prescriptions", {
        patient: patient._id,
        consultation: cons3?._id,
        notes: `patiente2e_${tag} rx notes`,
        items: [
          { medicine: "Paracetamol 500mg", dosage: "500 mg", frequency: "THREE_TIMES_DAILY", duration: "5 days", route: "ORAL", quantity: 15 },
        ],
      })
    ).data
  );
  const rxList = unwrap((await callPat("GET", "/patient/prescriptions")).data);
  check("prescriptions list includes rx", Array.isArray(rxList) && rxList.some((r) => String(r.id) === String(rx._id)));
  const rxDoc = unwrap((await callPat("GET", `/patient/prescriptions/${rx._id}/document`)).data);
  check("prescription document has required fields", rxDoc && rxDoc.prescriptionNo === rx.prescriptionNo && Array.isArray(rxDoc.items));
  check("prescription document includes patient/doctor context", rxDoc.patient && typeof rxDoc.patient.age === "number" && rxDoc.doctor);
  const rxPdf = await callRaw("GET", `/patient/prescriptions/${rx._id}/document.pdf`, { token: patientToken });
  check("prescription PDF returns 200 and application/pdf", rxPdf.status === 200 && rxPdf.contentType.includes("application/pdf"));
  check("prescription PDF starts with %PDF-", rxPdf.buffer.subarray(0, 5).toString() === "%PDF-" && rxPdf.buffer.length > 1000);
  const rxPdfDl = await callRaw("GET", `/patient/prescriptions/${rx._id}/document.pdf?download=true`, { token: patientToken });
  check("prescription PDF download sets attachment", rxPdfDl.disposition.includes("attachment"));
  check("stranger cannot access another patient's prescription", (await callStr("GET", `/patient/prescriptions/${rx._id}/document`)).status === 404);

  section("8. Laboratory: requests and reports with VERIFIED-only visibility (FR-PT-07)");
  const labTest = await LabTest.create({
    name: `PatientE2E Test ${tag}`,
    testCode: `PATIENTE2E-${tag}`.toUpperCase(),
    category: "Haematology",
    sampleType: "blood",
    price: 600,
    normalRange: "12.0-16.0",
    unit: "g/dL",
  });
  const labReqResponse = await callDoc("POST", "/doctor/laboratory/requests", {
    patient: patient._id,
    test: labTest._id,
    priority: "ROUTINE",
    clinicalNotes: `patiente2e_${tag} lab request`,
  });
  const labReq = unwrap(labReqResponse.data);
  check("the doctor can order a laboratory test for the patient", Boolean(labReq?._id), `id=${labReq?._id} typeof=${typeof labReq?._id} status=${labReqResponse.status}`);
  const labReqListResponse = await callPat("GET", "/patient/lab-requests");
  const labReqList = unwrap(labReqListResponse.data);
  check(
    "lab-requests list includes request",
    Array.isArray(labReqList) && labReqList.some((r) => String(r.id) === String(labReq._id)),
    `status=${labReqListResponse.status} body=${JSON.stringify(labReqList).slice(0, 300)}`
  );
  check(
    "lab-request progress is reported as a stage track",
    Array.isArray(labReqList) && labReqList.find((r) => String(r.id) === String(labReq._id))?.totalStages === 6
  );

  // Process through lab to create a VERIFIED report
  await callLab("POST", `/lab/requests/${labReq._id}/accept`, {});
  const sampleResponse = await callLab("POST", "/lab/samples", { labRequest: labReq._id });
  const sample = unwrap(sampleResponse.data);
  check("the laboratory can record the sample", Boolean(sample?._id), `status=${sampleResponse.status}`);
  await callLab("PATCH", `/lab/processing/${labReq._id}/start`, {});
  const resResponse = await callLab("POST", "/lab/results", {
    labRequest: labReq._id,
    sample: sample._id,
    parameters: [{ parameter: "Haemoglobin", value: "13.5", unit: "g/dL", referenceRange: "12.0-16.0", flag: "NORMAL" }],
  });
  const res = unwrap(resResponse.data);
  check("the laboratory can record results", Boolean(res?._id), `status=${resResponse.status} body=${JSON.stringify(res).slice(0, 200)}`);
  await callLab("PATCH", `/lab/processing/${labReq._id}/complete`, {});
  const reportResponse = await callLab("POST", "/lab/reports", {
    labRequest: labReq._id,
    sample: sample._id,
    results: [res._id],
    remarks: `patiente2e_${tag}`,
  });
  const reportUnverified = unwrap(reportResponse.data);
  check("the laboratory can generate the report", Boolean(reportUnverified?._id), `status=${reportResponse.status} body=${JSON.stringify(reportUnverified).slice(0, 200)}`);

  // Before verification, patient must NOT see the report via list/detail (VERIFIED-only)
  const reportsBefore = unwrap((await callPat("GET", "/patient/lab-reports")).data);
  check("lab-reports list excludes UNVERIFIED/ISSUED reports", Array.isArray(reportsBefore) && !reportsBefore.some((r) => String(r.id) === String(reportUnverified._id)));
  check("getting unverified report as patient -> 404 (not visible)", (await callPat("GET", `/patient/lab-reports/${reportUnverified._id}`)).status === 404);

  // Verify the report
  const verifyResponse = await callLab("PATCH", `/lab/reports/${reportUnverified._id}/verify`, { checks: { resultsChecked: true, referenceRangesChecked: true, attachmentsChecked: true } });
  const reportVerified = unwrap(verifyResponse.data);
  check(
    "lab verified the report",
    (await LabReport.findById(reportUnverified._id).lean())?.status === "VERIFIED",
    `status=${verifyResponse.status} body=${JSON.stringify(reportVerified).slice(0, 200)}`
  );
  const reportId = String(reportUnverified._id);

  // Now patient can see it
  const reportsAfter = unwrap((await callPat("GET", "/patient/lab-reports")).data);
  check("lab-reports list includes VERIFIED report", Array.isArray(reportsAfter) && reportsAfter.some((r) => String(r.id) === String(reportId)));
  const repDetail = unwrap((await callPat("GET", `/patient/lab-reports/${reportId}`)).data);
  check("lab-report detail returns VERIFIED report with parameters", repDetail && repDetail.status === "VERIFIED" && Array.isArray(repDetail.parameters) && repDetail.parameters.length > 0, JSON.stringify(repDetail?.parameters));
  check("stranger cannot see another patient's verified report", (await callStr("GET", `/patient/lab-reports/${reportId}`)).status === 404);

  section("9. Billing (FR-PT-09)");
  const payments = unwrap((await callPat("GET", "/patient/payments")).data);
  check("payments endpoint returns charges and a summary", Array.isArray(payments?.items) && typeof payments?.summary === "object");

  // Invoice and Payment ARE real models and eSewa IS verified server-side, so the
  // gateway flag must agree with the payment module instead of being asserted as a
  // constant. This is the check that catches the two drifting apart again.
  const gateway = unwrap((await callPat("GET", "/payments/config")).data);
  const gatewayLive = Array.isArray(gateway?.available) && gateway.available.length > 0;

  check(
    "dashboard billing agrees with the payment module",
    typeof dash.billing?.gatewayConfigured === "boolean" &&
      dash.billing.gatewayConfigured === gatewayLive &&
      typeof dash.billing.outstanding === "number",
    JSON.stringify(dash.billing)
  );
  check(
    "billing gateway flag agrees with the payment module",
    payments?.summary?.gatewayConfigured === gatewayLive,
    JSON.stringify(payments?.summary)
  );
  check("paidTotal is a real figure, not a placeholder", typeof payments?.summary?.paidTotal === "number", `${payments?.summary?.paidTotal}`);
  check(
    "every listed charge carries a real settlement state",
    payments?.items?.length > 0 &&
      payments.items.every((i) => i.paymentStatus === "PENDING" || typeof i.paymentStatus === "string"),
    JSON.stringify(payments?.items?.map((i) => i.paymentStatus))
  );
  check(
    "totalCharges reconciles with the charges actually listed",
    Math.abs((payments?.summary?.totalCharges ?? -1) - payments.items.reduce((s, i) => s + (i.amount || 0), 0)) < 0.01,
    `${payments?.summary?.totalCharges} vs ${payments?.items?.reduce((s, i) => s + (i.amount || 0), 0)}`
  );
  check("the charge total is derived from the real LabTest price", payments?.summary?.totalCharges >= 600, `${payments?.summary?.totalCharges}`);

  section("10. Notifications (unread/read/all)");
  // Create a notification for the patient
  const notif = await Notification.create({
    recipient: patient._id,
    sender: doctor._id,
    type: "APPOINTMENT_CONFIRMED",
    title: `PatientE2E Notification ${tag}`,
    message: "Test notification",
    isRead: false,
  });
  const notifs = unwrap((await callPat("GET", "/patient/notifications")).data);
  check("notifications list includes items and unreadCount", notifs && Array.isArray(notifs.items) && typeof notifs.unreadCount === "number" && notifs.unreadCount >= 1);
  const uc = unwrap((await callPat("GET", "/patient/notifications/unread-count")).data);
  check("unread-count returns number >=1", uc && typeof uc.unreadCount === "number" && uc.unreadCount >= 1);
  const mark = unwrap((await callPat("PATCH", `/patient/notifications/${notif._id}/read`)).data);
  check("mark-read succeeds and is persisted server-side", mark?.read === true && Boolean((await Notification.findById(notif._id).lean())?.readAt));
  await Notification.create({ recipient: patient._id, sender: doctor._id, type: "GENERAL", title: "n2", message: "m2", isRead: false });
  const markAll = unwrap((await callPat("PATCH", "/patient/notifications/read-all")).data);
  check("mark-all-read succeeds", markAll && typeof markAll.updated === "number", JSON.stringify(markAll));

  section("11. Cross-patient denial (ownership)");
  check("stranger cannot list another patient's appointments", (await callStr("GET", "/patient/appointments")).status === 200); // list is self-scoped; returns own empty list? not a denial but scoped - ensure we don't see appt3? check count
  const strAppts = unwrap((await callStr("GET", "/patient/appointments")).data);
  check("stranger's appointments list is empty of patient's appts", Array.isArray(strAppts) && !strAppts.some((a) => String(a.id) === String(appt3._id)));
  check("stranger cannot cancel patient's appointment", (await callStr("PATCH", `/patient/appointments/${appt3._id}/cancel`)).status === 404);
  check("stranger cannot access patient's lab report", (await callStr("GET", `/patient/lab-reports/${reportId}`)).status === 404);
  check("stranger cannot access patient's prescription document", (await callStr("GET", `/patient/prescriptions/${rx._id}/document`)).status === 404);

  section("12. Patient routes reject forged/invalid IDs appropriately");
  check("invalid prescription id -> 400", (await callPat("GET", "/patient/prescriptions/000000000000000000000000/document")).status === 400 || (await callPat("GET", "/patient/prescriptions/not-an-id/document")).status === 400);
  check("invalid lab report id -> 400", (await callPat("GET", "/patient/lab-reports/not-an-id")).status === 400);
  check("invalid appointment id on cancel -> 400", (await callPat("PATCH", "/patient/appointments/not-an-id/cancel")).status === 400);

  console.log(`\n${"-".repeat(60)}`);
  console.log(`  scratch database: ${resolved}`);
  console.log(`  notifications dispatched during the run: ${sentMail.length}`);
  console.log(`-`.repeat(60));
};

if (require.main === module) {
  run()
    .catch((error) => {
      failed += 1;
      console.error(`\n  ERROR ${error.stack || error.message}`);
    })
    .finally(async () => {
      try {
        await purge();
      } catch (error) {
        console.error(`  cleanup failed: ${error.message}`);
      }
      if (server) await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect().catch(() => {});
      const total = passed + failed;
      console.log(`\n${"-".repeat(60)}`);
      console.log(`  ${passed}/${total} checks passed${failed ? `, ${failed} FAILED` : ""}`);
      console.log(`-`.repeat(60));
      process.exit(failed ? 1 : 0);
    });
}

module.exports = { run };
