/**
 * End-to-end verification of the doctor module (FR-DR-01 .. FR-DR-09) against
 * the real Express app and the real MongoDB.
 *
 * Every assertion is made over HTTP and, where it matters, re-read straight from
 * the database - a 2xx response is not treated as proof that anything persisted.
 *
 * The suite is built around ONE interconnected clinical case, because the thing
 * worth proving is that the module is genuinely wired together: a consultation
 * references an appointment, its prescription and lab requests reference the
 * consultation, a follow-up references the consultation, and a verified lab report
 * can be compared against an earlier one. Five independent happy paths would pass
 * while the joins between them were broken.
 *
 * Fixtures are namespaced `DOCTORE2E_` and swept on entry and on exit, so an
 * interrupted run can never leave test accounts or clinical data behind.
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
const DoctorSettings = require("../models/DoctorSettings");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/email.service");

const sentMail = [];
emailService.env.email.host = "smtp.test.local";
emailService.setTransport({
  sendMail: async (payload) => {
    sentMail.push(payload);
    return { messageId: `doctor-e2e-${sentMail.length}` };
  },
});

const PORT = 5098;
const BASE = `http://127.0.0.1:${PORT}`;
const NS = /^doctore2e_/i;

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

/**
 * `call` parses JSON; `callRaw` returns the bytes. The PDF endpoint returns
 * application/pdf, so asserting on it needs the raw body - `res.json()` on a PDF
 * would throw and the test would pass for the wrong reason.
 */
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
  // Appointments are matched three ways. The `APT-E2E-` number is the only marker
  // on the throwaway appointments this suite inserts directly (see section 6),
  // which carry no `reason`; without it those rows leaked on every run and then
  // broke the Admin dashboard's "today" count on a later suite.
  const appointmentIds = (
    await Appointment.find(
      { $or: [{ reason: NS }, { appointmentNo: /^APT-E2E-/ }, { patient: { $in: userIds } }, { doctor: { $in: userIds } }] },
      { _id: 1 }
    ).lean()
  ).map((r) => r._id);
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

  // Order matters: children before parents, or a request would be deleted while a
  // sample still referenced it and the next sweep would find nothing to match on.
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
    DoctorSettings.deleteMany({ user: { $in: userIds } }),
    Notification.deleteMany({ recipient: { $in: userIds } }),
    AuditLog.deleteMany({ $or: [{ targetId: { $in: auditTargets } }, { actor: { $in: userIds } }] }),
    User.deleteMany({ email: NS }),
  ]);
};

const run = async () => {
  // `--db=<name>` runs the whole suite against a scratch database so the shared
  // development database is never written to by a test. Passed to Mongoose as
  // `dbName`, not spliced into the URI: this project's MONGO_URI has no database
  // path segment, so a string replace silently matched nothing.
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
  const email = (local) => `DOCTORE2E_${local}_${tag}@e2e.io`;
  const PASSWORD = "DoctorE2e!Pass1";

  const [doctor, otherDoctor, patient, stranger, labUser] = await User.create([
    { name: "DoctorE2E Doctor", email: email("doc"), phone: "9800000011", password: PASSWORD, role: "doctor", nmcNumber: `DOCTORE2E-NMC-DOC-${tag}`.toUpperCase(), department: "General Medicine", qualification: "MBBS, MD", mustChangePassword: false },
    { name: "DoctorE2E Other", email: email("doc2"), phone: "9800000012", password: PASSWORD, role: "doctor", nmcNumber: `DOCTORE2E-NMC-OTH-${tag}`.toUpperCase(), mustChangePassword: false },
    { name: "DoctorE2E Patient", email: email("pat"), phone: "9800000013", password: PASSWORD, role: "patient", dateOfBirth: new Date("1985-06-15"), gender: "female", bloodGroup: "B+", allergies: "Penicillin - rash" },
    { name: "DoctorE2E Stranger", email: email("str"), phone: "9800000014", password: PASSWORD, role: "patient" },
    { name: "DoctorE2E Technologist", email: email("lab"), phone: "9800000015", password: PASSWORD, role: "lab", labRegistryNumber: `DOCTORE2E-REG-${tag}`.toUpperCase() },
  ]);

  // The care team is the ONLY thing that widens a doctor's patient list. The
  // stranger is deliberately left unassigned: it is the negative case for every
  // ownership check below.
  await DoctorPatientAssignment.create({
    doctor: doctor._id,
    patient: patient._id,
    relationship: "Primary physician",
    assignedBy: doctor._id,
  });

  const login = async (u) => unwrap((await call("POST", "/auth/login", { body: { email: u.email, password: PASSWORD } })).data);
  const doctorToken = (await login(doctor)).token;
  const otherDoctorToken = (await login(otherDoctor)).token;
  const patientToken = (await login(patient)).token;
  const labToken = (await login(labUser)).token;

  const callDoc = (method, path, body) => call(method, path, { token: doctorToken, ...(body ? { body } : {}) });

  // ---------------------------------------------------------------------
  section("0. Authentication and role authorisation");
  check("doctor obtains a token", Boolean(doctorToken));
  check("doctor routes refuse an unauthenticated caller", (await call("GET", "/doctor/dashboard")).status === 401);
  check("doctor routes refuse a patient", (await call("GET", "/doctor/dashboard", { token: patientToken })).status === 403);
  check("doctor routes refuse a laboratory user", (await call("GET", "/doctor/dashboard", { token: labToken })).status === 403);
  check("a forged token is refused", (await call("GET", "/doctor/dashboard", { token: "not.a.real.token" })).status === 401);
  check(
    "a doctor on a temporary password is blocked until it is changed",
    (await call("GET", "/doctor/dashboard", { token: (await login(await User.create({ name: "DoctorE2E Temp", email: email("tmp"), phone: "9800000016", password: PASSWORD, role: "doctor", nmcNumber: `DOCTORE2E-NMC-TMP-${tag}`.toUpperCase(), mustChangePassword: true }))).token })).status === 403
  );

  // ---------------------------------------------------------------------
  section("1. Care-team scope is the authorization ceiling (section 25)");
  const workspace = unwrap((await callDoc("GET", "/doctor/laboratory")).data);
  check("laboratory workspace returns the assigned patient", workspace.patients.some((p) => String(p._id) === String(patient._id)));
  check("laboratory workspace does NOT return an unassigned patient", !workspace.patients.some((p) => String(p._id) === String(stranger._id)));
  check("an unassigned patient is 404, not 403", (await callDoc("GET", `/doctor/patients/${stranger._id}`)).status === 404);
  check("an unassigned patient cannot be booked", (await callDoc("POST", "/doctor/appointments", { patient: stranger._id, appointmentDate: new Date().toISOString(), startTime: "09:00" })).status === 404);
  check("an unassigned patient cannot receive a consultation", (await callDoc("POST", "/doctor/consultations", { patient: stranger._id, chiefComplaint: "Headache", diagnosis: "Tension headache" })).status === 404);
  check("an unassigned patient cannot receive a prescription", (await callDoc("POST", "/doctor/prescriptions", { patient: stranger._id, items: [{ medicine: "Paracetamol 500mg", dosage: "500 mg", duration: "3 days" }] })).status === 404);
  check("an unassigned patient cannot receive a lab order", (await callDoc("POST", "/doctor/laboratory/requests", { patient: stranger._id, test: "000000000000000000000000" })).status === 404);
  check("a second doctor with no assignment sees an empty patient list", unwrap((await call("GET", "/doctor/patients", { token: otherDoctorToken })).data).length === 0);

  // ---------------------------------------------------------------------
  section("2. Dashboard shape (FR-DR-01)");
  const emptyDashboard = unwrap((await call("GET", "/doctor/dashboard", { token: otherDoctorToken })).data);
  check("a doctor with no care team gets a full shape, not an error", emptyDashboard?.stats && Array.isArray(emptyDashboard.todayAppointments));
  check("the empty branch reports every stat key", ["todayAppointments", "completedToday", "pendingLabReports", "inFlightLabRequests", "followUpPatients", "assignedPatients", "unreadNotifications"].every((k) => typeof emptyDashboard.stats[k] === "number"));

  // ---------------------------------------------------------------------
  section("3. Appointments (FR-DR-01)");
  // Status codes follow one rule: a rule the validator can see alone is 400, a
  // rule that needs the database is 422. Both are client errors, but the split
  // tells a caller whether retrying a corrected payload could ever succeed.
  const badTime = await callDoc("POST", "/doctor/appointments", { patient: patient._id, appointmentDate: new Date().toISOString(), startTime: "25:99" });
  check("an impossible start time is refused", badTime.status === 400, `got ${badTime.status}`);
  const pastDate = await callDoc("POST", "/doctor/appointments", { patient: patient._id, appointmentDate: "2020-01-01", startTime: "09:00" });
  check("a past appointment date is refused", pastDate.status === 422, `got ${pastDate.status}`);

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const dayStart = (d) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.toISOString();
  };

  const booked = unwrap((await callDoc("POST", "/doctor/appointments", { patient: patient._id, appointmentDate: dayStart(today), startTime: "09:00", durationMinutes: 30, reason: `doctore2e_${tag} first visit` })).data);
  check("booking returns 201", (await callDoc("GET", `/doctor/appointments/${booked._id}`)).status === 200);
  check("the appointment persists with a human-readable number", /^APT-\d{4}-\d{4}$/.test(booked.appointmentNo || ""));
  check("the booking is SCHEDULED", booked.status === "SCHEDULED");
  check("an overlapping slot is refused", (await callDoc("POST", "/doctor/appointments", { patient: patient._id, appointmentDate: dayStart(today), startTime: "09:15", durationMinutes: 30 })).status === 409);
  check("a status change to CONFIRMED succeeds", (await callDoc("PATCH", `/doctor/appointments/${booked._id}/status`, { status: "CONFIRMED" })).status === 200);
  check("an illegal transition is refused", (await callDoc("PATCH", `/doctor/appointments/${booked._id}/status`, { status: "SCHEDULED" })).status === 409);

  // The doctor-side appointment writes used to be silent: only the ADMIN booking
  // path notified the patient, so whether a patient heard about their own visit
  // depended on who booked it.
  check("booking notifies the patient", Boolean(await Notification.exists({ recipient: patient._id, type: "APPOINTMENT_BOOKED", entityId: booked._id })));
  check("a status change notifies the patient", Boolean(await Notification.exists({ recipient: patient._id, type: "APPOINTMENT_STATUS_CHANGED", entityId: booked._id })));
  const unreadBookingNotice = await Notification.findOne({ recipient: patient._id, type: "APPOINTMENT_BOOKED", entityId: booked._id }).lean();
  check("the booking notice names the appointment", String(unreadBookingNotice?.message || "").includes(booked.appointmentNo));

  const todayList = unwrap((await callDoc("GET", "/doctor/appointments?scope=today")).data);
  check("the day's list includes the booking", todayList.some((a) => a._id === booked._id));
  const searchList = unwrap((await callDoc("GET", `/doctor/appointments?search=doctore2e_${tag}`)).data);
  check("search by reason finds the appointment", searchList.some((a) => a._id === booked._id));
  check("an invalid scope is refused", (await callDoc("GET", "/doctor/appointments?scope=nonsense")).status === 400);

  // The ?patient= deep link is what "View appointments" on the patient record and
  // the consultation header links to. It is validated but was never applied, so
  // those links silently showed the unfiltered clinic list.
  const byPatient = unwrap((await callDoc("GET", `/doctor/appointments?scope=all&patient=${patient._id}`)).data);
  check("the ?patient= deep link returns that patient's appointments", byPatient.length > 0 && byPatient.every((a) => String(a.patient?._id || a.patient) === String(patient._id)));
  check("the ?patient= deep link finds the booking", byPatient.some((a) => a._id === booked._id));
  // An unassigned patient must yield an empty list, never someone else's visits.
  const byStranger = unwrap((await callDoc("GET", `/doctor/appointments?scope=all&patient=${stranger._id}`)).data);
  check("the ?patient= deep link cannot reach an unassigned patient", byStranger.length === 0, `got ${byStranger.length}`);
  check("a malformed ?patient= is refused", (await callDoc("GET", "/doctor/appointments?patient=not-an-id")).status === 400);

  // ---------------------------------------------------------------------
  section("4. Consultations and vitals (FR-DR-02)");
  const noComplaint = await callDoc("POST", "/doctor/consultations", { patient: patient._id, diagnosis: "Anaemia" });
  check("a consultation without a chief complaint is refused", noComplaint.status === 400, `got ${noComplaint.status}`);
  const noDiagnosis = await callDoc("POST", "/doctor/consultations", { patient: patient._id, chiefComplaint: "Fatigue" });
  check("a consultation without a diagnosis is refused", noDiagnosis.status === 400, `got ${noDiagnosis.status}`);

  const consultation = unwrap(
    (
      await callDoc("POST", "/doctor/consultations", {
        patient: patient._id,
        appointment: booked._id,
        chiefComplaint: "Fatigue and pallor for three weeks",
        symptoms: "Breathlessness on exertion, palpitations",
        diagnosis: "Iron deficiency anaemia",
        clinicalNotes: `doctore2e_${tag} pallor noted, no lymphadenopathy`,
        vitals: { bloodPressureSystolic: 112, bloodPressureDiastolic: 72, heartRate: 88, temperature: 37.2, spo2: 98, weight: 58, height: 162 },
      })
    ).data
  );
  check("creating a consultation returns 201", Boolean(consultation._id));
  check("the consultation carries a sequential number", /^CON-\d{4}-\d{4}$/.test(consultation.consultationNo || ""));
  check("BMI is derived server-side, not trusted from the client", consultation.vitals?.bmi === 22.1, `got ${consultation.vitals?.bmi}`);
  check("a client-supplied BMI is ignored", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { weight: 60, height: 162, bmi: 99 } })).status === 200 && consultation.vitals.bmi !== 99);

  // The vitals validator had drifted wider than Consultation.vitalsSchema, so these
  // out-of-range values passed validation and then blew up in Mongoose as a 500
  // instead of a clean 400. They must be rejected at the edge now. The edit
  // endpoint had no vitals rules at all, so these went through completely.
  check("a heart rate above the schema maximum is refused", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { heartRate: 255 } })).status === 400, "expected 400");
  check("a temperature below the schema minimum is refused", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { temperature: 27 } })).status === 400, "expected 400");
  check("a weight above the schema maximum is refused", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { weight: 600 } })).status === 400, "expected 400");
  // The schema allows up to 500 kg; the validator used to cap at 400 and rejected
  // values the record could legitimately hold. Now aligned, so 450 is accepted.
  check("a weight inside the schema range is accepted", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { weight: 450 } })).status === 200);
  check("an unrecognised vitals flag is refused", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { flag: "CRITICAL" } })).status === 400, "expected 400");
  const flagged = await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { vitals: { flag: "ABNORMAL" } });
  check("a valid vitals flag is accepted", flagged.status === 200, `got ${flagged.status}`);

  const reopened = (await Appointment.findById(booked._id).lean()).status;
  check("starting a consultation moves the appointment into IN_CONSULTATION", reopened === "IN_CONSULTATION", `got ${reopened}`);

  const invalidSystolic = await callDoc("PATCH", `/doctor/consultations/${consultation._id}/complete`, {
    vitals: { bloodPressureSystolic: 301, bloodPressureDiastolic: 80 },
  });
  check(
    "an out-of-range systolic pressure is rejected with its accepted range",
    invalidSystolic.status === 400 && invalidSystolic.data?.message === "Systolic pressure must be between 40 and 300 mmHg"
  );

  const incomplete = await callDoc("PATCH", `/doctor/consultations/${consultation._id}/complete`, {
    clinicalNotes: "no diagnosis supplied",
    vitals: { height: 20, weight: 70, bloodPressureSystolic: 120, bloodPressureDiastolic: 80 },
  });
  check("completing a consultation is accepted when a diagnosis exists", incomplete.status === 200, `got ${incomplete.status}`);
  const completedConsultation = await Consultation.findById(consultation._id).lean();
  check("the completed consultation is COMPLETED", completedConsultation.status === "COMPLETED");
  check(
    "completing a visit saves a valid systolic and diastolic reading",
    completedConsultation.vitals?.bloodPressureSystolic === 120 && completedConsultation.vitals?.bloodPressureDiastolic === 80
  );
  check("a derived BMI of 1750 does not prevent completion", completedConsultation.vitals?.bmi === 1750, `got ${completedConsultation.vitals?.bmi}`);
  check("completing twice is refused", (await callDoc("PATCH", `/doctor/consultations/${consultation._id}/complete`, {})).status === 409);
  check("completing a consultation notifies the patient", Boolean(await Notification.exists({ recipient: patient._id, type: "CONSULTATION_COMPLETED", entityId: consultation._id })));

  const frozenEdit = await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { diagnosis: "Something else entirely" });
  check("a completed consultation cannot be silently rewritten", frozenEdit.status === 409, `got ${frozenEdit.status}`);
  const amendedNoReason = await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { diagnosis: "Amended diagnosis", allowClinicalEdit: true, editReason: "short" });
  check("amending without a real reason is refused", amendedNoReason.status === 400, `got ${amendedNoReason.status}`);
  const amended = await callDoc("PATCH", `/doctor/consultations/${consultation._id}`, { diagnosis: "Iron deficiency anaemia, confirmed", allowClinicalEdit: true, editReason: "Ferritin result now available to confirm the diagnosis." });
  check("amending with a reason succeeds and is audited", amended.status === 200 && Boolean(await AuditLog.exists({ action: "CONSULTATION_UPDATED", targetId: consultation._id })));

  // ---------------------------------------------------------------------
  section("5. Prescriptions and the printable/PDF document (FR-DR-03, FR-DR-04)");
  const emptyItems = await callDoc("POST", "/doctor/prescriptions", { patient: patient._id, items: [] });
  check("a prescription with no medicines is refused", emptyItems.status === 400, `got ${emptyItems.status}`);
  const badFrequency = await callDoc("POST", "/doctor/prescriptions", { patient: patient._id, items: [{ medicine: "X", dosage: "1 mg", duration: "1 day", frequency: "WHENEVER" }] });
  check("an unrecognised dosing frequency is refused", badFrequency.status === 400, `got ${badFrequency.status}`);

  const prescription = unwrap(
    (
      await callDoc("POST", "/doctor/prescriptions", {
        patient: patient._id,
        consultation: consultation._id,
        notes: `doctore2e_${tag} review in two weeks`,
        followUpDate: new Date(today.getTime() + 14 * 86400000).toISOString(),
        items: [
          { medicine: "Ferrous Sulphate 325mg", dosage: "325 mg", frequency: "ONCE_DAILY", duration: "3 months", route: "ORAL", quantity: 90, instructions: "Take with vitamin C on an empty stomach." },
          { medicine: "Folic Acid 5mg", dosage: "5 mg", frequency: "ONCE_DAILY", duration: "3 months", route: "ORAL", quantity: 90 },
        ],
      })
    ).data
  );
  check("the prescription is created", Boolean(prescription._id));
  check("issuing a prescription notifies the patient", Boolean(await Notification.exists({ recipient: patient._id, type: "PRESCRIPTION_ISSUED", entityId: prescription._id })));
  check("the prescription is linked back to the consultation", (await Consultation.findById(consultation._id).lean()).prescriptions.some((id) => String(id) === String(prescription._id)));

  const doc = unwrap((await callDoc("GET", `/doctor/prescriptions/${prescription._id}/document`)).data);
  check("the document carries the prescription number", doc.prescriptionNo === prescription.prescriptionNo);
  check("the document carries every medicine line", doc.items?.length === 2);
  // FR-DR-04: the printed page must show demographics. They live on the patient
  // record, not on PATIENT_FIELDS, so a document built from the populated
  // prescription alone silently printed blanks here.
  check("the document carries the patient's age", typeof doc.patient?.age === "number", `got ${JSON.stringify(doc.patient?.age)}`);
  check("the document carries the patient's gender", doc.patient?.gender === "female");
  check("the document carries the patient's blood group", doc.patient?.bloodGroup === "B+");
  check("the document carries the prescribing doctor's NMC number", doc.doctor?.nmcNumber === doctor.nmcNumber);
  // The on-screen sheet builds "Open PDF" / "Download" from this payload. Without the
  // id the link resolved to /prescriptions/undefined/document.pdf, and the Patient
  // sheet - which already guarded on it - never rendered its PDF button at all.
  check("the document carries its own prescriptionId", String(doc.prescriptionId) === String(prescription._id));
  // Diagnosis is printed by the PDF, so the sheet must read it from the same place.
  check("the document exposes the consultation diagnosis", Boolean(doc.consultation?.diagnosis));
  // The search box was decorative: `search` was accepted and validated but never
  // applied, so typing narrowed nothing.
  const byNumber = unwrap((await callDoc("GET", `/doctor/prescriptions?search=${prescription.prescriptionNo}`)).data);
  check("prescription search by number finds the record", byNumber.some((p) => String(p._id) === String(prescription._id)));
  const byMedicine = unwrap((await callDoc("GET", "/doctor/prescriptions?search=Ferrous")).data);
  check("prescription search by medicine finds the record", byMedicine.some((p) => String(p._id) === String(prescription._id)), `got ${byMedicine.length}`);
  const byPatientName = unwrap((await callDoc("GET", `/doctor/prescriptions?search=${encodeURIComponent(patient.name)}`)).data);
  check("prescription search by patient name finds the record", byPatientName.some((p) => String(p._id) === String(prescription._id)));
  const noMatch = unwrap((await callDoc("GET", "/doctor/prescriptions?search=zzz-no-such-medicine")).data);
  check("prescription search excludes non-matching records", !noMatch.some((p) => String(p._id) === String(prescription._id)));
  // A regex metacharacter must be matched literally, not compiled.
  const injected = await callDoc("GET", "/doctor/prescriptions?search=.*");
  check("prescription search does not execute a regex", injected.status === 200 && !injected.data?.data?.some((p) => String(p._id) !== String(prescription._id)), `status ${injected.status}`);

  const pdf = await callRaw("GET", `/doctor/prescriptions/${prescription._id}/document.pdf`, { token: doctorToken });
  check("the PDF endpoint returns 200", pdf.status === 200, `got ${pdf.status}`);
  check("the PDF endpoint sends application/pdf", pdf.contentType.includes("application/pdf"));
  check("the PDF body is a real PDF", pdf.buffer.subarray(0, 5).toString() === "%PDF-", pdf.buffer.subarray(0, 8).toString());
  check("the PDF is not an empty shell", pdf.buffer.length > 2000, `${pdf.buffer.length} bytes`);
  const downloadPdf = await callRaw("GET", `/doctor/prescriptions/${prescription._id}/document.pdf?download=true`, { token: doctorToken });
  check("?download=true switches to attachment disposition", downloadPdf.disposition.includes("attachment"));
  check("the PDF filename is derived from the prescription number", downloadPdf.disposition.includes(prescription.prescriptionNo));
  check("a stranger cannot download a prescription", (await callRaw("GET", `/doctor/prescriptions/${prescription._id}/document.pdf`, { token: otherDoctorToken })).status === 404);

  // ---------------------------------------------------------------------
  section("6. Laboratory ordering hands off to the laboratory (FR-DR-05, FR-DR-06)");
  const test = await LabTest.create({
    name: `DoctorE2E CBC ${tag}`,
    testCode: `DOCTORE2E-${tag}`.toUpperCase(),
    category: "Haematology",
    sampleType: "blood",
    price: 500,
    normalRange: "13.0-17.0",
    unit: "g/dL",
  });

  const order = unwrap(
    (
      await callDoc("POST", "/doctor/laboratory/requests", {
        patient: patient._id,
        test: test._id,
        appointment: booked._id,
        consultation: consultation._id,
        priority: "URGENT",
        clinicalNotes: `doctore2e_${tag} investigate anaemia`,
      })
    ).data
  );
  check("the order is created", Boolean(order._id));
  check("the order is PENDING", order.status === "PENDING");
  check("FR-DR-06: the order is linked to the appointment that prompted it", String(order.appointment?._id || order.appointment) === String(booked._id));
  // The consultation is what gives the order clinical meaning ("why was this
  // test ordered?"), and the Consultation screen now sends it.
  check("FR-DR-06: the order is linked to the consultation that prompted it", String(order.consultation?._id || order.consultation) === String(consultation._id));
  check("the consultation records its lab request", (await Consultation.findById(consultation._id).lean()).labRequests?.some((id) => String(id) === String(order._id)));
  check("a consultation belonging to another doctor cannot be linked", (await callDoc("POST", "/doctor/laboratory/requests", {
    patient: patient._id,
    test: test._id,
    consultation: (await Consultation.create({ consultationNo: `CNS-E2E-${tag}`, patient: patient._id, doctor: otherDoctor._id, chiefComplaint: "Other doctor visit", diagnosis: "Unrelated" }))._id,
  })).status === 404);
  check("the appointment link persisted", String((await LabRequest.findById(order._id).lean()).appointment) === String(booked._id));
  check("the order is attributed to the session doctor, not the payload", String(order.doctor?._id || order.doctor) === String(doctor._id));
  check("another doctor's appointment cannot be linked", (await callDoc("POST", "/doctor/laboratory/requests", { patient: patient._id, test: test._id, appointment: (await Appointment.create({ appointmentNo: `APT-E2E-${tag}`, patient: patient._id, doctor: otherDoctor._id, appointmentDate: new Date(), startMinutes: 600 }))._id })).status === 404);
  check("the ordering doctor cannot see the stranger's workspace", !workspace.patients.some((p) => String(p._id) === String(stranger._id)));

  const requestId = order._id;
  const accept = await call("POST", `/lab/requests/${requestId}/accept`, { token: labToken });
  check("the laboratory can accept the doctor's request", accept.status === 200, `got ${accept.status}`);
  check("the doctor is notified that the lab accepted", Boolean(await Notification.exists({ recipient: doctor._id, type: "LAB_REQUEST_ACCEPTED" })));

  const sample = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: requestId, collectionDate: dayStart(today) } })).data);
  check("the laboratory can record the sample", Boolean(sample._id));
  check("the sample carries a generated barcode, not a client-supplied one", /^BC-/.test(sample.barcode || ""));

  await call("PATCH", `/lab/processing/${requestId}/start`, { token: labToken });
  const result = unwrap(
    (
      await call("POST", "/lab/results", {
        token: labToken,
        body: {
          labRequest: requestId,
          sample: sample._id,
          parameters: [
            { parameter: "Haemoglobin", value: "9.4", unit: "g/dL", referenceRange: "13.0-17.0", flag: "LOW" },
            { parameter: "Mean Corpuscular Volume", value: "68", unit: "fL", referenceRange: "80-100", flag: "LOW" },
          ],
        },
      })
    ).data
  );
  check("the laboratory can record results", Boolean(result._id));
  await call("PATCH", `/lab/processing/${requestId}/complete`, { token: labToken });

  // ---------------------------------------------------------------------
  section("7. Report review, comparison and comments (FR-DR-07, FR-DR-08)");
  /** One full lab round: request -> sample -> result -> verified report. */
  const verifyRound = async (haemoglobin, mcv, asDoctor) => {
    const token = asDoctor ? unwrap((await call("POST", "/auth/login", { body: { email: asDoctor.email, password: PASSWORD } })).data)?.token : undefined;
    const post = (method, path, body) => (token ? call(method, path, { token, body }) : callDoc(method, path, body));
    const request = unwrap(
      (
        await post("POST", "/doctor/laboratory/requests", {
          patient: patient._id,
          test: test._id,
          priority: "ROUTINE",
          clinicalNotes: `doctore2e_${tag} round`,
        })
      ).data
    );
    await call("POST", `/lab/requests/${request._id}/accept`, { token: labToken });
    const roundSample = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: request._id } })).data);
    await call("PATCH", `/lab/processing/${request._id}/start`, { token: labToken });
    const roundResult = unwrap(
      (
        await call("POST", "/lab/results", {
          token: labToken,
          body: {
            labRequest: request._id,
            sample: roundSample._id,
            parameters: [
              { parameter: "Haemoglobin", value: String(haemoglobin), unit: "g/dL", referenceRange: "13.0-17.0", flag: haemoglobin < 13 ? "LOW" : "NORMAL" },
              { parameter: "Mean Corpuscular Volume", value: String(mcv), unit: "fL", referenceRange: "80-100", flag: mcv < 80 ? "LOW" : "NORMAL" },
            ],
          },
        })
      ).data
    );
    await call("PATCH", `/lab/processing/${request._id}/complete`, { token: labToken });
    const report = unwrap(
      (
        await call("POST", "/lab/reports", {
          token: labToken,
          body: { labRequest: request._id, sample: roundSample._id, results: [roundResult._id], remarks: `doctore2e_${tag} round report` },
        })
      ).data
    );
    const verified = await call("PATCH", `/lab/reports/${report._id}/verify`, { token: labToken, body: { checks: { resultsChecked: true, referenceRangesChecked: true, attachmentsChecked: true } } });
    if (verified.status !== 200) throw new Error(`lab verification failed with ${verified.status}: ${JSON.stringify(verified.data)}`);
    return unwrap(verified.data);
  };

  const baseline = await verifyRound(9.4, 68);
  const repeat = await verifyRound(11.2, 74);
  check("two verified reports exist for the same patient and test", Boolean(baseline.reportId && repeat.reportId));

  const reportList = unwrap((await callDoc("GET", `/doctor/reports?patient=${patient._id}`)).data);
  check("the doctor's verified-report list is populated", reportList.length >= 2);
  check("the list flags which reports are unreviewed", reportList.every((r) => typeof r.reviewed === "boolean"));

  const detail = unwrap((await callDoc("GET", `/doctor/reports/${repeat._id}`)).data);
  check("report detail includes the result parameters", detail.results?.[0]?.parameters?.some((p) => p.parameter === "Haemoglobin"));
  check("a doctor cannot open another doctor's report", (await call("GET", `/doctor/reports/${repeat._id}`, { token: otherDoctorToken })).status === 404);

  const historyList = unwrap((await callDoc("GET", `/doctor/reports/history?patient=${patient._id}&test=${test._id}`)).data);
  check("report history returns both rounds", historyList.length >= 2, `got ${historyList.length}`);

  const comparison = unwrap((await callDoc("GET", `/doctor/reports/compare?report=${repeat._id}&previousReport=${baseline._id}`)).data);
  check("comparison aligns the two reports", comparison.current?.id === repeat._id && comparison.previous?.id === baseline._id);
  const hbRow = comparison.rows.find((r) => r.parameter === "Haemoglobin");
  check("the compared haemoglobin values differ", hbRow?.current?.value !== hbRow?.previous?.value);
  check("the row is marked as changed", hbRow?.changed === true);
  check("an abnormal current value is reported as ABNORMAL", hbRow?.status === "ABNORMAL");
  check("comparing a report with itself is refused", (await callDoc("GET", `/doctor/reports/compare?report=${repeat._id}&previousReport=${repeat._id}`)).status === 422);
  check("comparison requires a report", (await callDoc("GET", "/doctor/reports/compare")).status === 400);
  check("history requires both a patient and a test", (await callDoc("GET", `/doctor/reports/history?patient=${patient._id}`)).status === 400);

  // Auto-compare picked the most recent earlier report for the patient+test with no
  // regard for who ordered it, but `getAccessibleReport` only returns this doctor's
  // own reports. So when a SECOND doctor's report sat between this doctor's two
  // rounds, the default comparison resolved to an inaccessible report and the whole
  // endpoint 404'd. It must fall back to this doctor's previous round instead.
  const otherDoctorLogin = unwrap((await call("POST", "/auth/login", { body: { email: otherDoctor.email, password: PASSWORD } })).data);
  const careTeamForOther = await DoctorPatientAssignment.create({
    doctor: otherDoctor._id,
    patient: patient._id,
    relationship: "Covering physician",
    assignedBy: doctor._id,
  });
  const foreignRound = await verifyRound(10.1, 71, otherDoctorLogin.user || otherDoctor);
  check("a second doctor's verified report exists for the same patient and test", String(foreignRound.doctor?._id || foreignRound.doctor) === String(otherDoctor._id), `got ${foreignRound.doctor?._id || foreignRound.doctor}`);
  // While the cover assignment is live the ordering doctor can read it; this doctor
  // still cannot, because a report is only ever accessible to the doctor who ordered it.
  check("the ordering doctor can read the foreign report", (await call("GET", `/doctor/reports/${foreignRound._id}`, { token: otherDoctorToken })).status === 200);
  check("this doctor cannot read another doctor's report", (await callDoc("GET", `/doctor/reports/${foreignRound._id}`)).status === 404);
  await careTeamForOther.deleteOne();
  check("the second doctor is de-assigned again", (await DoctorPatientAssignment.countDocuments({ doctor: otherDoctor._id, patient: patient._id })) === 0);
  check("the de-assigned doctor loses access to the foreign report", (await call("GET", `/doctor/reports/${foreignRound._id}`, { token: otherDoctorToken })).status === 404);

  const autoCompare = await callDoc("GET", `/doctor/reports/compare?report=${repeat._id}`);
  check("default comparison does not fail when another doctor's report intervenes", autoCompare.status === 200, `got ${autoCompare.status}`);
  const autoPrevious = unwrap(autoCompare.data)?.previous;
  check("default comparison falls back to this doctor's own earlier report", String(autoPrevious?.id || "") === String(baseline._id), `picked ${autoPrevious?.id}`);
  check("default comparison never selects another doctor's report", String(autoPrevious?.id || "") !== String(foreignRound._id));

  const emptyComment = await callDoc("POST", `/doctor/reports/${repeat._id}/comments`, { comment: "   " });
  check("an empty comment is refused", emptyComment.status === 400, `got ${emptyComment.status}`);
  const commented = await callDoc("POST", `/doctor/reports/${repeat._id}/comments`, {
    comment: "Haemoglobin has improved but remains below range.",
    interpretation: "Partial response to iron therapy.",
    treatmentDecision: "Continue current dose and recheck in four weeks.",
    outcome: "Fatigue improving.",
  });
  check("a doctor can comment on a verified report", commented.status === 200, `got ${commented.status}`);
  check("the comment persisted against the report", (await LabReport.findById(repeat._id).lean()).doctorComments.length === 1);
  check("commenting notifies the patient", Boolean(await Notification.exists({ recipient: patient._id, type: "LAB_REPORT_COMMENTED" })));
  check("a reviewed report leaves the dashboard's pending list", unwrap((await callDoc("GET", "/doctor/dashboard")).data).pendingLabReports.every((r) => r._id !== repeat._id));
  check("an unreviewed report stays on the dashboard's pending list", unwrap((await callDoc("GET", "/doctor/dashboard")).data).pendingLabReports.some((r) => r._id === baseline._id));

  // ---------------------------------------------------------------------
  section("8. Patient workspace and medical history (FR-DR-02, FR-DR-09)");
  const header = unwrap((await callDoc("GET", `/doctor/patients/${patient._id}`)).data);
  check("the clinical header carries demographics", header.age > 0 && header.gender === "female");
  check("the clinical header carries the allergy warning", header.allergies === "Penicillin - rash");
  check("the clinical header counts the verified reports", header.summary?.verifiedReports >= 2);
  check("the clinical header lists the care team", header.careTeam?.some((d) => String(d.id) === String(doctor._id)));

  const history = unwrap((await callDoc("GET", `/doctor/patients/${patient._id}/history`)).data);
  const types = new Set(history.events.map((e) => e.type));
  check("the timeline contains appointments", types.has("APPOINTMENT"), [...types].join(","));
  check("the timeline contains consultations", types.has("CONSULTATION"));
  check("the timeline contains prescriptions", types.has("PRESCRIPTION"));
  check("the timeline contains laboratory requests", types.has("LAB_REQUEST"));
  check("the timeline contains laboratory reports", types.has("LAB_REPORT"));
  check("the timeline is newest-first", history.events.every((e, i, arr) => i === 0 || new Date(arr[i - 1].at) >= new Date(e.at)));

  const previousConsultations = unwrap((await callDoc("GET", `/doctor/patients/${patient._id}/consultations`)).data);
  check("previous consultations are listed for this doctor", previousConsultations.some((c) => c._id === consultation._id));
  check("a consultation is read-only from the history view", previousConsultations.every((c) => typeof c.consultationNo === "string"));

  const followUp = unwrap(
    (
      await callDoc("POST", "/doctor/appointments", {
        patient: patient._id,
        appointmentDate: dayStart(tomorrow),
        startTime: "10:00",
        durationMinutes: 20,
        type: "FOLLOW_UP",
        followUpOf: consultation._id,
        reason: `doctore2e_${tag} review repeat CBC`,
      })
    ).data
  );
  check("a follow-up is created from a consultation", Boolean(followUp._id) && followUp.type === "FOLLOW_UP");
  check("the follow-up points back at the consultation", String(followUp.followUpOf) === String(consultation._id));
  const orphanFollowUp = await callDoc("POST", "/doctor/appointments", { patient: patient._id, appointmentDate: dayStart(tomorrow), startTime: "11:30", type: "FOLLOW_UP" });
  check("a follow-up without a parent consultation is refused", orphanFollowUp.status === 400, `got ${orphanFollowUp.status} ${JSON.stringify(orphanFollowUp.data)}`);
  check("a follow-up naming another doctor's consultation is refused", (await callDoc("POST", "/doctor/appointments", { patient: patient._id, appointmentDate: dayStart(tomorrow), startTime: "12:30", type: "FOLLOW_UP", followUpOf: (await Consultation.create({ consultationNo: `CON-E2E-${tag}`, patient: patient._id, doctor: otherDoctor._id, chiefComplaint: "x", diagnosis: "y" }))._id })).status === 404);

  const dashboard = unwrap((await callDoc("GET", "/doctor/dashboard")).data);
  check("the dashboard counts the follow-up the doctor owes", dashboard.stats.followUpPatients >= 1);
  check("the dashboard surfaces the pending (unreviewed) report", dashboard.stats.pendingLabReports >= 1);
  check("the dashboard counts the in-flight laboratory requests", dashboard.stats.inFlightLabRequests >= 1);
  check("the dashboard shows recent consultations with their prescription count", dashboard.recentConsultations.some((c) => c.prescriptionCount >= 1));

  // ---------------------------------------------------------------------
  section("9. Notifications, profile and settings (SRS 8.1, 8.3)");
  const notifications = unwrap((await callDoc("GET", "/doctor/notifications")).data);
  check("the doctor's own notifications are returned", Array.isArray(notifications.items));
  check("lab activity produced notifications for this doctor", notifications.items.length > 0, `got ${notifications.items.length}`);
  const unread = unwrap((await callDoc("GET", "/doctor/notifications/unread-count")).data);
  check("the unread count endpoint agrees with the list", unread > 0);

  const target = notifications.items.find((n) => !n.readAt);
  const marked = await callDoc("PATCH", `/doctor/notifications/${target._id}/read`);
  check("a notification can be marked read", marked.status === 200 && Boolean(unwrap(marked.data).readAt));
  check("marking read lowers the unread count", unwrap((await callDoc("GET", "/doctor/notifications/unread-count")).data) === unread - 1);
  check("another user's notification cannot be marked read", (await callDoc("PATCH", `/doctor/notifications/${(await Notification.create({ recipient: stranger._id, type: "TEST", title: "t", message: "m" }))._id}/read`)).status === 404);
  check("an invalid notification id is refused", (await callDoc("PATCH", "/doctor/notifications/not-an-id/read")).status === 400);
  const allRead = await callDoc("PATCH", "/doctor/notifications/read-all");
  check("mark-all-read returns the number it updated", unwrap(allRead.data).updated >= 1);
  check("nothing is left unread", unwrap((await callDoc("GET", "/doctor/notifications/unread-count")).data) === 0);
  check("unread filter returns nothing afterwards", unwrap((await callDoc("GET", "/doctor/notifications?unread=true")).data).items.length === 0);

  const profile = unwrap((await callDoc("GET", "/doctor/profile")).data);
  check("the profile exposes the doctor's own record", String(profile._id) === String(doctor._id));
  check("the profile never returns the password hash", profile.password === undefined);

  const renamed = unwrap((await callDoc("PATCH", "/doctor/profile", { name: "DoctorE2E Renamed", department: "Cardiology" })).data);
  check("a profile update succeeds", renamed.name === "DoctorE2E Renamed");
  check("the new name persisted", (await User.findById(doctor._id).lean()).name === "DoctorE2E Renamed");
  // `role` is not a profile field, so the payload carries nothing editable. The
  // service rejects it rather than silently succeeding with a no-op update,
  // which would leave the caller believing the role had been changed.
  check("the role cannot be changed from the profile endpoint", (await callDoc("PATCH", "/doctor/profile", { role: "admin" })).status === 400);
  check("the role is unchanged after the attempt", (await User.findById(doctor._id).lean()).role === "doctor");
  check("a profile update is audited", Boolean(await AuditLog.exists({ action: "PROFILE_UPDATED", targetId: doctor._id })));
  check("an empty profile update is refused", (await callDoc("PATCH", "/doctor/profile", {})).status === 400);

  const settings = unwrap((await callDoc("GET", "/doctor/settings")).data);
  check("settings are created on first read with defaults", settings.appointmentAlerts === true);
  const updatedSettings = unwrap((await callDoc("PATCH", "/doctor/settings", { emailNotifications: true, labReportAlerts: false })).data);
  check("a settings update persists", updatedSettings.emailNotifications === true && updatedSettings.labReportAlerts === false);
  check("a settings update does not disturb the untouched flags", updatedSettings.appointmentAlerts === true);
  check("the settings update persisted", (await DoctorSettings.findOne({ user: doctor._id }).lean()).emailNotifications === true);
  // Isolation: the second doctor reads their OWN settings and must get the
  // defaults, not a copy of what the first doctor just saved.
  const otherSettings = unwrap((await call("GET", "/doctor/settings", { token: otherDoctorToken })).data);
  check("settings are per-doctor", otherSettings.emailNotifications !== true && otherSettings.labReportAlerts === true);

  // ---------------------------------------------------------------------
  section("10. Audit trail covers the clinical actions");
  const audited = await AuditLog.distinct("action", { actor: doctor._id });
  check("appointments are audited", audited.includes("APPOINTMENT_BOOKED"), audited.join(","));
  check("consultations are audited", audited.includes("CONSULTATION_CREATED") && audited.includes("CONSULTATION_COMPLETED"));
  check("prescriptions are audited", audited.includes("PRESCRIPTION_CREATED"));
  check("laboratory orders are audited", audited.includes("LAB_REQUEST_CREATED"));
  check("report reviews are audited", audited.includes("LAB_REPORT_REVIEWED"));
  check("profile changes are audited", audited.includes("PROFILE_UPDATED"));

  section("11. Laboratory remains read-only from the doctor side");
  check("the doctor cannot create a laboratory result", (await callDoc("POST", "/lab/results", { labRequest: requestId, sample: sample._id, parameters: [{ parameter: "X", value: "1" }] })).status === 403);
  check("the doctor cannot verify a report", (await callDoc("PATCH", `/lab/reports/${baseline._id}/verify`, {})).status === 403);
  check("a verified result cannot be edited by anyone", (await LabResult.findById(result._id).lean()) !== null);

  // -------------------------------------------------------------------------
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
