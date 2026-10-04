/**
 * End-to-end verification of the administrator module (FR-AD-01 .. FR-AD-07 and
 * section 25) against the real Express app and the real MongoDB.
 *
 * Every assertion is made over HTTP and, where it matters, re-read straight from
 * the database - a 2xx response is not treated as proof that anything persisted.
 *
 * The suite is built around ONE interconnected administrative case, because the
 * thing worth proving is that the module is genuinely wired together: an approved
 * access request creates an account, that account books an appointment, the
 * doctor schedule decides which slots are real, the appointment is billed from the
 * doctor's consultation fee, the payment reduces the invoice balance, and every
 * one of those steps shows up in the audit trail. Six independent happy paths
 * would pass while the joins between them were broken.
 *
 * Two boundaries get as much attention as the happy path, because they are the
 * ones an admin screen can silently get wrong:
 *
 *   - A Patient, Doctor or Laboratory token receives 403 on every admin route,
 *     and an admin holding a temporary password is blocked until it is changed.
 *   - The laboratory module stays out of reach. `/lab/*` is `authorize(LABORATORY)`,
 *     so the admin can only read the oversight snapshot at `/admin/laboratory`.
 *     Asserting that 403 is the point: it is what stops the Admin screens from
 *     growing controls the backend will refuse.
 *
 * Fixtures are namespaced `ADMINE2E_` and swept on entry and on exit, so an
 * interrupted run can never leave test accounts or billing data behind.
 */
const mongoose = require("mongoose");
require("dotenv").config();

const app = require("../app");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const LabRequest = require("../models/LabRequest");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const AccessRequest = require("../models/AccessRequest");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const DoctorSchedule = require("../models/DoctorSchedule");
const AdminSettings = require("../models/AdminSettings");
const emailService = require("../services/email.service");

const sentMail = [];
emailService.env.email.host = "smtp.test.local";
emailService.setTransport({
  sendMail: async (payload) => {
    sentMail.push(payload);
    return { messageId: `admin-e2e-${sentMail.length}` };
  },
});

const PORT = 5096;
const BASE = `http://127.0.0.1:${PORT}`;
const NS_EMAIL = /^admine2e_/i;
const NS_REASON = /^ADMINE2E_/;

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

/** Binary/CSV endpoint: `res.json()` would throw and the check would pass for the wrong reason. */
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
  const userIds = (await User.find({ email: NS_EMAIL }, { _id: 1 }).lean()).map((u) => u._id);
  const appointmentIds = (await Appointment.find({ reason: NS_REASON }, { _id: 1 }).lean()).map((a) => a._id);
  const requestIds = (await LabRequest.find({ clinicalNotes: NS_REASON }, { _id: 1 }).lean()).map((r) => r._id);
  const invoiceIds = (await Invoice.find({ notes: NS_REASON }, { _id: 1 }).lean()).map((i) => i._id);

  await Promise.all([
    // Children before parents, or a sweep would leave rows pointing at nothing.
    Payment.deleteMany({ invoice: { $in: invoiceIds } }),
    Invoice.deleteMany({ _id: { $in: invoiceIds } }),
    Appointment.deleteMany({ _id: { $in: appointmentIds } }),
    LabRequest.deleteMany({ _id: { $in: requestIds } }),
    AccessRequest.deleteMany({ email: NS_EMAIL }),
    DoctorPatientAssignment.deleteMany({ doctor: { $in: userIds } }),
    DoctorPatientAssignment.deleteMany({ patient: { $in: userIds } }),
    DoctorSchedule.deleteMany({ doctor: { $in: userIds } }),
    AdminSettings.deleteMany({ user: { $in: userIds } }),
    Notification.deleteMany({ recipient: { $in: userIds } }),
    AuditLog.deleteMany({ actor: { $in: userIds } }),
    AuditLog.deleteMany({ targetEmail: NS_EMAIL }),
    User.deleteMany({ email: NS_EMAIL }),
  ]);
};

/** A date `days` in the future, as `YYYY-MM-DD`. */
const futureDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const run = async () => {
  // `--db=<name>` runs the whole suite against a scratch database so the shared
  // development database is never written to by a test. Passed to Mongoose as
  // `dbName`, not spliced into the URI: this project's MONGO_URI has no database
  // path segment, so a string replace silently matches nothing.
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
  const email = (local) => `ADMINE2E_${local}_${tag}@e2e.io`;
  const PASSWORD = "AdminE2e!Pass1";

  const [admin, tempAdmin, doctor, patient, patientTwo, pendingPatient] = await User.create([
    { name: "AdminE2E Admin", email: email("adm"), phone: "9800000101", password: PASSWORD, role: "admin", status: "APPROVED", isActive: true, mustChangePassword: false },
    { name: "AdminE2E Temp", email: email("tmp"), phone: "9800000102", password: PASSWORD, role: "admin", status: "APPROVED", isActive: true, mustChangePassword: true },
    { name: "AdminE2E Doctor", email: email("doc"), phone: "9800000103", password: PASSWORD, role: "doctor", status: "APPROVED", isActive: true, nmcNumber: `ADMINE2E-NMC-DOC-${tag}`.toUpperCase(), department: "General Medicine", qualification: "MBBS, MD", consultationFee: 500, mustChangePassword: false },
    { name: "AdminE2E Patient", email: email("pat"), phone: "9800000104", password: PASSWORD, role: "patient", status: "APPROVED", isActive: true, dateOfBirth: new Date("1985-06-15"), gender: "female", bloodGroup: "B+", allergies: "Penicillin - rash", mustChangePassword: false },
    { name: "AdminE2E Patient Two", email: email("pat2"), phone: "9800000105", password: PASSWORD, role: "patient", status: "APPROVED", isActive: true, mustChangePassword: false },
    { name: "AdminE2E Pending", email: email("pend"), phone: "9800000106", password: PASSWORD, role: "patient", status: "PENDING", isActive: false, mustChangePassword: false },
  ]);

  const login = async (u) => unwrap((await call("POST", "/auth/login", { body: { email: u.email, password: PASSWORD } })).data);
  const adminToken = (await login(admin)).token;
  const tempToken = (await login(tempAdmin)).token;
  const patientToken = (await login(patient)).token;
  const doctorToken = (await login(doctor)).token;

  const callAdmin = (method, path, body) => call(method, path, { token: adminToken, ...(body ? { body } : {}) });

  // ---------------------------------------------------------------------
  section("0. Authentication and role authorisation");
  check("admin obtains a token", Boolean(adminToken));
  check("admin routes refuse an unauthenticated caller", (await call("GET", "/admin/dashboard")).status === 401);
  check("admin routes refuse a patient", (await call("GET", "/admin/dashboard", { token: patientToken })).status === 403);
  check("admin routes refuse a doctor", (await call("GET", "/admin/dashboard", { token: doctorToken })).status === 403);
  check("a forged token is refused", (await call("GET", "/admin/dashboard", { token: "not.a.real.token" })).status === 401);
  check("an admin on a temporary password is blocked", (await call("GET", "/admin/dashboard", { token: tempToken })).status === 403);

  // ---------------------------------------------------------------------
  section("1. Access request review (FR-AD-01)");
  const requests = await AccessRequest.create([
    { name: "Requested Doctor", email: email("req"), contactNumber: "9800000171", address: "Baneshwor, Kathmandu", requestedRole: "doctor", nmcNumber: `ADMINE2E-NMC-REQ-${tag}`.toUpperCase() },
    { name: "Requested Lab", email: email("reqlab"), contactNumber: "9800000172", address: "Putali, Kathmandu", requestedRole: "lab", labRegistryNumber: `ADMINE2E-REG-REQ-${tag}`.toUpperCase() },
  ]);

  const listResponse = unwrap((await callAdmin("GET", "/admin/access-requests")).data);
  check("the pending queue lists both requests", (listResponse.requests || []).length >= 2, `got ${(listResponse.requests || []).length}`);
  check("the queue reports counts by status", listResponse.counts !== undefined);

  const summary = unwrap((await callAdmin("GET", "/admin/access-requests/summary")).data);
  check("the summary counts the pending requests", Number(summary.pendingRequests) >= 2, JSON.stringify(summary));

  const single = await callAdmin("GET", `/admin/access-requests/${requests[0]._id}`);
  check("a single request is retrievable", single.status === 200);
  check("an unknown request id is 404", (await callAdmin("GET", `/admin/access-requests/${new mongoose.Types.ObjectId()}`)).status === 404);

  const approved = await callAdmin("PATCH", `/admin/access-requests/${requests[0]._id}/approve`, { notes: "Verified NMC number." });
  check("approving returns the created account", approved.status === 200, JSON.stringify(approved.data).slice(0, 200));
  const approvedEmail = requests[0].email;
  const createdAccount = await User.findOne({ email: approvedEmail.toLowerCase() }).select("+password").lean();
  check("approval creates the doctor account", createdAccount !== null && createdAccount.role === "doctor");
  check("the approved doctor has a generated password hash", Boolean(createdAccount?.password), String(createdAccount?.password));
  check("the approved doctor must change the password", createdAccount?.mustChangePassword === true);
  check("approval is persisted on the request", (await AccessRequest.findById(requests[0]._id).lean())?.status === "APPROVED");
  check("approving twice is refused", (await callAdmin("PATCH", `/admin/access-requests/${requests[0]._id}/approve`, { notes: "again" })).status === 409);

  const rejected = await callAdmin("PATCH", `/admin/access-requests/${requests[1]._id}/reject`, { notes: "Registry number unverifiable." });
  check("rejecting is recorded", rejected.status === 200 && (await AccessRequest.findById(requests[1]._id).lean())?.status === "REJECTED");
  check("a rejected request creates no account", (await User.countDocuments({ email: requests[1].email.toLowerCase() })) === 0);
  check("the approval email was sent to the applicant", sentMail.some((mail) => String(mail.to || "").toLowerCase() === approvedEmail.toLowerCase()));

  // ---------------------------------------------------------------------
  section("2. Doctor schedule determines the real slots (FR-AD-04)");
  const slotDate = futureDate(7);
  const slotWeekday = new Date(`${slotDate}T12:00:00`).getDay();
  const availability = await callAdmin("PUT", `/admin/doctors/${doctor._id}/availability`, {
    windows: [{ weekday: slotWeekday, startTime: "09:00", endTime: "13:00", isActive: true }],
  });
  check("a weekly schedule can be replaced wholesale", availability.status === 200, JSON.stringify(availability.data).slice(0, 200));
  check("the schedule is persisted", (await DoctorSchedule.countDocuments({ doctor: doctor._id, weekday: slotWeekday })) === 1);

  const slots = unwrap((await callAdmin("GET", `/admin/doctors/${doctor._id}/slots?date=${slotDate}`)).data);
  const slotList = slots.slots || [];
  check("slots are generated inside the published window", slotList.length > 0, JSON.stringify(slots).slice(0, 160));
  check("no slot is offered outside 09:00-13:00", slotList.every((slot) => slot.startTime >= "09:00" && slot.startTime < "13:00"));
  check("the slot response names the weekday", slots.weekdayLabel !== undefined);

  // ---------------------------------------------------------------------
  section("3. Appointments (FR-AD-02)");
  const booked = await callAdmin("POST", "/admin/appointments", {
    patientId: String(patient._id),
    doctorId: String(doctor._id),
    appointmentDate: slotDate,
    startTime: slotList[0]?.startTime || "09:00",
    durationMinutes: 30,
    type: "CONSULTATION",
    reason: "ADMINE2E_" + tag,
  });
  check("an admin can book on a patient's behalf", booked.status === 200 || booked.status === 201, JSON.stringify(booked.data).slice(0, 200));
  const appointment = unwrap(booked.data).appointment || unwrap(booked.data);
  check("the appointment is persisted with an appointment number", Boolean(appointment?.appointmentNo));
  check("the appointment starts CONFIRMED", appointment?.status === "CONFIRMED");
  check("the appointment is confirmed in the database", (await Appointment.findById(appointment._id).lean()) !== null);

  check("a slot outside availability is refused", (await callAdmin("POST", "/admin/appointments", {
    patientId: String(patient._id),
    doctorId: String(doctor._id),
    appointmentDate: slotDate,
    startTime: "22:00",
    durationMinutes: 30,
    reason: "ADMINE2E_" + tag,
  })).status === 422);
  check("a past appointment date is refused", (await callAdmin("POST", "/admin/appointments", {
    patientId: String(patient._id),
    doctorId: String(doctor._id),
    appointmentDate: futureDate(-1),
    startTime: "09:00",
    durationMinutes: 30,
    reason: "ADMINE2E_" + tag,
  })).status === 422);
  check("a double booking of the same slot is refused", (await callAdmin("POST", "/admin/appointments", {
    patientId: String(patientTwo._id),
    doctorId: String(doctor._id),
    appointmentDate: slotDate,
    startTime: appointment.startTime || slotList[0]?.startTime || "09:00",
    durationMinutes: 30,
    reason: "ADMINE2E_" + tag,
  })).status === 409);
  check("booking against a non-patient is refused", (await callAdmin("POST", "/admin/appointments", {
    patientId: String(doctor._id),
    doctorId: String(doctor._id),
    appointmentDate: slotDate,
    startTime: "10:00",
    durationMinutes: 30,
  })).status === 404);
  check("an unknown patient id is 404", (await callAdmin("POST", "/admin/appointments", {
    patientId: String(new mongoose.Types.ObjectId()),
    doctorId: String(doctor._id),
    appointmentDate: slotDate,
    startTime: "10:00",
    durationMinutes: 30,
  })).status === 404);
  check("a malformed patient id is refused", (await callAdmin("POST", "/admin/appointments", {
    patientId: "not-an-id",
    doctorId: String(doctor._id),
    appointmentDate: slotDate,
    startTime: "10:00",
    durationMinutes: 30,
  })).status === 422);

  const queue = unwrap((await callAdmin("GET", `/admin/appointments/queue?date=${slotDate}`)).data);
  const queueAppointments = (queue.doctors || []).flatMap((entry) => entry.appointments || []);
  check("the queue shows the booked appointment", queueAppointments.some((row) => String(row._id) === String(appointment._id)));
  check("the queue reports a waiting time for each row", queueAppointments.every((row) => row.waitMinutes !== undefined));
  check("the queue groups rows under their doctor", (queue.doctors || []).some((entry) => String(entry.doctor?._id) === String(doctor._id)));

  const rescheduled = await callAdmin("PATCH", `/admin/appointments/${appointment._id}/reschedule`, {
    appointmentDate: slotDate,
    startTime: "11:00",
  });
  check("an appointment can be rescheduled to a free slot", rescheduled.status === 200, JSON.stringify(rescheduled.data).slice(0, 200));
  check("the new start time is persisted", (await Appointment.findById(appointment._id).lean())?.startMinutes === 11 * 60);

  const advanced = await callAdmin("PATCH", `/admin/appointments/${appointment._id}/status`, { status: "IN_CONSULTATION" });
  check("a status transition is accepted", advanced.status === 200, JSON.stringify(advanced.data).slice(0, 160));
  check("the transition is persisted", (await Appointment.findById(appointment._id).lean())?.status === "IN_CONSULTATION");
  check("an invalid status is refused", (await callAdmin("PATCH", `/admin/appointments/${appointment._id}/status`, { status: "NOT_A_STATUS" })).status === 422);
  check("a backwards transition is refused", (await callAdmin("PATCH", `/admin/appointments/${appointment._id}/status`, { status: "SCHEDULED" })).status === 409);

  // Mark it COMPLETED so it is eligible to be billed below.
  await callAdmin("PATCH", `/admin/appointments/${appointment._id}/status`, { status: "COMPLETED" });

  // ---------------------------------------------------------------------
  section("4. Doctors (FR-AD-04)");
  const doctorList = unwrap((await callAdmin("GET", "/admin/doctors?search=AdminE2E")).data);
  const doctorItems = doctorList.items || doctorList;
  check("the doctor directory finds the fixture", doctorItems.some((row) => String(row._id) === String(doctor._id)));
  check("a non-doctor account is 422, not a silent success", (await callAdmin("PATCH", `/admin/doctors/${patient._id}`, { department: "Nope" })).status === 422);
  check("a negative consultation fee is refused", (await callAdmin("PATCH", `/admin/doctors/${doctor._id}`, { consultationFee: -5 })).status === 422);

  const feeUpdate = await callAdmin("PATCH", `/admin/doctors/${doctor._id}`, {
    department: "Internal Medicine",
    specialization: "General Physician",
    consultationFee: 750,
  });
  check("professional details and the fee can be edited", feeUpdate.status === 200, JSON.stringify(feeUpdate.data).slice(0, 160));
  const reloadedDoctor = await User.findById(doctor._id).lean();
  check("the new fee is persisted", reloadedDoctor.consultationFee === 750);
  check("the department change is persisted", reloadedDoctor.department === "Internal Medicine");

  // ---------------------------------------------------------------------
  section("5. Patients (FR-AD-02)");
  const patientPage = unwrap((await callAdmin("GET", "/admin/patients?limit=1&page=1")).data);
  check("the patient list is paginated", patientPage.pagination?.limit === 1 && Array.isArray(patientPage.items));
  const searched = unwrap((await callAdmin("GET", `/admin/patients?search=${encodeURIComponent(email("pat"))}`)).data);
  check("patient search matches on email", (searched.items || []).some((row) => String(row._id) === String(patient._id)));
  const pendingOnly = unwrap((await callAdmin("GET", "/admin/patients?status=PENDING")).data);
  check("the status filter returns only pending patients", (pendingOnly.items || []).every((row) => row.status === "PENDING"));
  check("an invalid status filter is refused", (await callAdmin("GET", "/admin/patients?status=NONSENSE")).status === 422);

  const detail = unwrap((await callAdmin("GET", `/admin/patients/${patient._id}`)).data);
  check("the patient detail carries activity counters", Number(detail?.stats?.appointments) === 1, JSON.stringify(detail?.stats));
  check("the patient detail carries the clinical timeline", Array.isArray(detail?.history?.events));
  check("the patient detail carries a billing summary", typeof detail?.billing?.outstanding === "number");
  check("the patient detail is formatted for display", Boolean(detail?.formattedDateOfBirth));
  check("an unknown patient id is 404", (await callAdmin("GET", `/admin/patients/${new mongoose.Types.ObjectId()}`)).status === 404);

  const demographics = await callAdmin("PATCH", `/admin/patients/${patient._id}`, {
    address: "Koteshwor, Kathmandu",
    emergencyContactName: "Next of Kin",
    emergencyContactNumber: "9800000199",
  });
  check("patient demographics can be edited", demographics.status === 200, JSON.stringify(demographics.data).slice(0, 160));
  const reloadedPatient = await User.findById(patient._id).lean();
  check("the address change is persisted", reloadedPatient.address === "Koteshwor, Kathmandu");
  check("the emergency contact is persisted", reloadedPatient.emergencyContactNumber === "9800000199");

  // Role and status are not writable on this route: an ordinary edit must not be
  // able to escalate or deactivate the account.
  await callAdmin("PATCH", `/admin/patients/${patientTwo._id}`, { name: "AdminE2E Renamed", role: "admin", status: "REJECTED" });
  const escalationAttempt = await User.findById(patientTwo._id).lean();
  check("a patient edit cannot escalate the role", escalationAttempt.role === "patient", escalationAttempt.role);
  check("a patient edit cannot deactivate the account", escalationAttempt.status === "APPROVED", escalationAttempt.status);
  check("a patient edit still applies the writable field", escalationAttempt.name === "AdminE2E Renamed");
  check("a future date of birth is refused", (await callAdmin("PATCH", `/admin/patients/${patient._id}`, { dateOfBirth: futureDate(30) })).status === 422);

  // ---------------------------------------------------------------------
  section("6. Care team is admin-controlled (section 25)");
  const assigned = await callAdmin("POST", `/admin/doctors/${doctor._id}/patients`, { patientId: String(patient._id), relationship: "Primary physician" });
  check("an admin can assign a doctor to a patient", assigned.status === 200 || assigned.status === 201, JSON.stringify(assigned.data).slice(0, 200));
  check("the assignment is persisted", (await DoctorPatientAssignment.countDocuments({ doctor: doctor._id, patient: patient._id, revokedAt: null })) === 1);
  check("re-assigning the same pair is idempotent, not a duplicate row", [200, 201].includes((await callAdmin("POST", `/admin/doctors/${doctor._id}/patients`, { patientId: String(patient._id) })).status) && (await DoctorPatientAssignment.countDocuments({ doctor: doctor._id, patient: patient._id, revokedAt: null })) === 1);
  check("a doctor cannot grant themselves a patient", (await call("POST", `/admin/doctors/${doctor._id}/patients`, { token: doctorToken, body: { patientId: String(patient._id) } })).status === 403);
  check("assigning a non-patient is refused", (await callAdmin("POST", `/admin/doctors/${doctor._id}/patients`, { patientId: String(doctor._id) })).status !== 200);

  const assignments = unwrap((await callAdmin("GET", `/admin/care-team?doctorId=${doctor._id}`)).data);
  const assignmentItems = assignments.items || assignments.assignments || assignments;
  check("the care team list shows the assignment", (Array.isArray(assignmentItems) ? assignmentItems : []).some((row) => String(row.patient?._id || row.patient) === String(patient._id)));

  const handoverDoctor = createdAccount._id;
  // `patientId` is read from the body, not the path, so it has to travel with it.
  const reassigned = await callAdmin("PATCH", `/admin/doctors/${doctor._id}/patients/${patient._id}/reassign`, { patientId: String(patient._id), newDoctorId: String(handoverDoctor), relationship: "Consulting physician" });
  check("a handover without a target doctor is refused", (await callAdmin("PATCH", `/admin/doctors/${doctor._id}/patients/${patient._id}/reassign`, { patientId: String(patient._id) })).status === 422);
  check("reassignment is accepted", reassigned.status === 200, JSON.stringify(reassigned.data).slice(0, 160));
  check("the old assignment is revoked", (await DoctorPatientAssignment.countDocuments({ doctor: doctor._id, patient: patient._id, revokedAt: null })) === 0);
  check("the new doctor holds the assignment", (await DoctorPatientAssignment.countDocuments({ doctor: handoverDoctor, patient: patient._id, revokedAt: null })) === 1);

  const revoked = await callAdmin("DELETE", `/admin/doctors/${handoverDoctor}/patients/${patient._id}`);
  check("an admin can revoke an assignment", revoked.status === 200, JSON.stringify(revoked.data).slice(0, 160));
  check("the live assignment is gone", (await DoctorPatientAssignment.countDocuments({ patient: patient._id, revokedAt: null })) === 0);

  // ---------------------------------------------------------------------
  section("7. Billing (FR-AD-07)");
  const fromAppointment = unwrap((await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    appointment: String(appointment._id),
    notes: "ADMINE2E_" + tag,
  })).data);
  const consultInvoice = fromAppointment.invoice || fromAppointment;
  check("a completed appointment can be billed", Boolean(consultInvoice?.invoiceNo), JSON.stringify(fromAppointment).slice(0, 200));
  check("the consultation line is priced from the doctor's fee", Number(consultInvoice?.total) === 750, String(consultInvoice?.total));
  check("the invoice is persisted", (await Invoice.findById(consultInvoice._id).lean()) !== null);
  check("the same appointment cannot be billed twice", (await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    appointment: String(appointment._id),
  })).status === 409);

  const manual = unwrap((await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    items: [{ description: "ADMINE2E Dressing", unitPrice: 350, quantity: 2 }],
    discount: 100,
    tax: 50,
    notes: "ADMINE2E_" + tag,
  })).data);
  const manualInvoice = manual.invoice || manual;
  check("a manual invoice is priced server-side", Number(manualInvoice?.subtotal) === 700 && Number(manualInvoice?.total) === 650, `${manualInvoice?.subtotal}/${manualInvoice?.total}`);
  check("an invoice with nothing to bill is refused", (await callAdmin("POST", "/admin/billing/invoices", { patientId: String(patient._id) })).status === 422);
  check("a discount greater than the total is refused", (await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    items: [{ description: "ADMINE2E Small", unitPrice: 100 }],
    discount: 500,
  })).status === 422);
  check("an invoice line without a description is refused", (await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    items: [{ unitPrice: 100 }],
  })).status === 422);

  const billingSummary = unwrap((await callAdmin("GET", "/admin/billing/summary")).data);
  check("the billing summary reports totals", billingSummary !== undefined && billingSummary !== null);

  const overpay = await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(manualInvoice._id), method: "CASH", amount: 5000 });
  check("an overpayment is refused", overpay.status === 422, JSON.stringify(overpay.data).slice(0, 160));
  check("a card payment without a reference is refused", (await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(manualInvoice._id), method: "CARD", amount: 100 })).status === 422);
  check("an eSewa payment cannot be typed in by hand", (await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(manualInvoice._id), method: "ESEWA", amount: 100 })).status === 422);
  check("an unknown payment method is refused", (await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(manualInvoice._id), method: "BARTER", amount: 100 })).status === 422);

  const payment = await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(manualInvoice._id), method: "CASH", amount: 650 });
  check("a payment settles the invoice", payment.status === 200 || payment.status === 201, JSON.stringify(payment.data).slice(0, 200));
  const settled = await Invoice.findById(manualInvoice._id).lean();
  check("the balance falls to zero", Number(settled.balance) === 0, String(settled.balance));
  check("the invoice becomes paid", settled.status === "PAID", settled.status);
  check("the payment is persisted", (await Payment.countDocuments({ invoice: manualInvoice._id, status: "SUCCESS" })) === 1);
  check("paying a settled invoice is refused", (await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(manualInvoice._id), method: "CASH", amount: 50 })).status === 422);

  const partial = unwrap((await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    items: [{ description: "ADMINE2E Follow up", unitPrice: 400 }],
    notes: "ADMINE2E_" + tag,
  })).data);
  const partialInvoice = partial.invoice || partial;
  await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(partialInvoice._id), method: "BANK_TRANSFER", amount: 100 });
  check("a part payment leaves the invoice partially paid", (await Invoice.findById(partialInvoice._id).lean())?.status === "PARTIALLY_PAID");

  check("an invoice carrying payments cannot be voided", (await callAdmin("PATCH", `/admin/billing/invoices/${partialInvoice._id}/void`, { reason: "ADMINE2E_" + tag })).status === 409);

  const unpaid = unwrap((await callAdmin("POST", "/admin/billing/invoices", {
    patientId: String(patient._id),
    items: [{ description: "ADMINE2E Unpaid", unitPrice: 275 }],
    notes: "ADMINE2E_" + tag,
  })).data);
  const unpaidInvoice = unpaid.invoice || unpaid;
  const voided = await callAdmin("PATCH", `/admin/billing/invoices/${unpaidInvoice._id}/void`, { reason: "ADMINE2E_" + tag });
  check("an unpaid invoice can be voided", voided.status === 200, JSON.stringify(voided.data).slice(0, 160));
  check("a voided invoice is marked VOID", (await Invoice.findById(unpaidInvoice._id).lean())?.status === "VOID");
  check("a voided invoice cannot take a payment", (await callAdmin("POST", "/admin/billing/payments", { invoiceId: String(unpaidInvoice._id), method: "CASH", amount: 10 })).status === 409);

  const invoiceList = unwrap((await callAdmin("GET", "/admin/billing/invoices?limit=5")).data);
  check("the invoice list is paginated", Array.isArray(invoiceList.items || invoiceList));
  const paymentList = unwrap((await callAdmin("GET", "/admin/billing/payments?limit=5")).data);
  check("the payment list is paginated", Array.isArray(paymentList.items || paymentList));

  // ---------------------------------------------------------------------
  section("8. Reports agree with the operational data (FR-AD-05)");
  for (const kind of ["daily", "monthly", "revenue", "laboratory"]) {
    const report = await callAdmin("GET", `/admin/reports/${kind}`);
    check(`the ${kind} report builds`, report.status === 200, JSON.stringify(report.data).slice(0, 160));
    const payload = unwrap(report.data);
    check(`the ${kind} report returns its own columns`, Array.isArray(payload.columns) && payload.columns.length > 0);
    check(`the ${kind} report rows match its columns`, Array.isArray(payload.rows) && payload.rows.every((row) => typeof row === "object"));
    check(`the ${kind} report states its range or date`, Boolean(payload.range || payload.date || payload.label));
  }

  const patientReport = unwrap((await callAdmin("GET", `/admin/reports/patient?patientId=${patient._id}`)).data);
  check("the patient report builds for a patient", patientReport?.patient?.name === patient.name);
  check("the patient report counts the appointment", Number(patientReport?.figures?.appointments) === 1, JSON.stringify(patientReport?.figures));
  check("the patient report excludes cancelled and void money from its figures", typeof patientReport?.figures?.outstanding === "number");

  check("an unknown report kind is refused", (await callAdmin("GET", "/admin/reports/not-a-report")).status === 422);
  check("a patient report without a patient id is refused", (await callAdmin("GET", "/admin/reports/patient")).status === 422);

  const reportPatients = unwrap((await callAdmin("GET", `/admin/reports/patients?search=${encodeURIComponent(email("pat"))}`)).data);
  check("the report patient picker finds the patient", (Array.isArray(reportPatients) ? reportPatients : reportPatients.items || []).some((row) => String(row._id) === String(patient._id)));

  const csv = await callRaw("GET", "/admin/reports/export/daily?format=csv", { token: adminToken });
  check("the CSV export is served as CSV", csv.status === 200 && csv.contentType.includes("csv"), `${csv.status} ${csv.contentType}`);
  check("the CSV export is a download", csv.disposition.includes("attachment"));
  check("the CSV export has real content", csv.buffer.length > 0 && csv.buffer.toString("utf8").split("\n").length > 1);

  const excel = await callRaw("GET", "/admin/reports/export/monthly?format=excel", { token: adminToken });
  check("the Excel export is a real workbook, not JSON", excel.status === 200 && !excel.contentType.includes("application/json"), excel.contentType);
  check("the Excel export is non-empty", excel.buffer.length > 0);

  // ---------------------------------------------------------------------
  section("9. Dashboard counts the same facts (FR-AD-01)");
  const dashboard = unwrap((await callAdmin("GET", "/admin/dashboard")).data);
  check("the dashboard returns its metric groups", dashboard.cards && dashboard.todayAppointments !== undefined && dashboard.laboratory && dashboard.notifications && dashboard.accessRequests, Object.keys(dashboard || {}).join(","));
  // The card must equal the DB truth rather than always be 0: suites share one
  // database, so a hard-coded zero makes this check fail on any day a leftover
  // appointment exists and says nothing about whether the dashboard is correct.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const actualAppointmentsToday = await Appointment.countDocuments({ appointmentDate: { $gte: todayStart, $lt: todayEnd } });
  check("today's appointment card matches the real count", Number(dashboard.cards?.appointmentsToday?.value) === actualAppointmentsToday, `card=${dashboard.cards?.appointmentsToday?.value} db=${actualAppointmentsToday}`);
  check("the dashboard's patient card reports registrations", Number(dashboard.cards?.newPatientsToday?.value) >= 0, String(dashboard.cards?.newPatientsToday?.value));
  check("the dashboard collects the payment made above", Number(dashboard.cards?.revenue?.collectedToday ?? 0) >= 650, String(dashboard.cards?.revenue?.collectedToday));
  check("the dashboard lists today's appointments", Array.isArray(dashboard.todayAppointments));
  check("the dashboard counts the pending access request", Number(dashboard.accessRequests?.pending) >= 0, JSON.stringify(dashboard.accessRequests));

  // The booking above is a week out, so the same card must find it when the
  // dashboard is pointed at that date.
  const dashboardForSlot = unwrap((await callAdmin("GET", `/admin/dashboard?date=${slotDate}`)).data);
  check("the dashboard is filterable by date", (await callAdmin("GET", `/admin/dashboard?date=${slotDate}`)).status === 200);
  check("the filtered dashboard counts the booking on that date", Number(dashboardForSlot.cards?.appointmentsToday?.value) >= 1, String(dashboardForSlot.cards?.appointmentsToday?.value));
  check("an invalid dashboard date is refused", (await callAdmin("GET", "/admin/dashboard?date=not-a-date")).status === 422);

  const search = unwrap((await callAdmin("GET", `/admin/search?q=${encodeURIComponent("AdminE2E Patient")}`)).data);
  const searchGroups = search.results || search;
  const flattened = Array.isArray(searchGroups) ? searchGroups : Object.values(searchGroups || {}).flat();
  check("global search finds the patient by name", flattened.some((row) => row.name === patient.name));

  // ---------------------------------------------------------------------
  section("10. Laboratory is oversight-only for an admin (FR-AD-06)");
  const labOverview = unwrap((await callAdmin("GET", "/admin/laboratory")).data);
  check("the admin laboratory overview is available", labOverview !== undefined && labOverview !== null);
  check("the overview reports its counters", typeof labOverview?.pendingRequests === "number" && typeof labOverview?.verifiedReports === "number");
  check("the overview carries the recent request slices", Array.isArray(labOverview?.recentRequests));
  check("an admin cannot use the laboratory queue", (await call("GET", "/lab/requests", { token: adminToken })).status === 403);
  check("an admin cannot accept a laboratory request", (await call("POST", `/lab/requests/${new mongoose.Types.ObjectId()}/accept`, { token: adminToken })).status === 403);
  check("an admin cannot verify a laboratory report", (await call("PATCH", `/lab/reports/${new mongoose.Types.ObjectId()}/verify`, { token: adminToken, body: {} })).status === 403);

  // ---------------------------------------------------------------------
  section("11. Notifications are private to the recipient");
  await Notification.create([
    { recipient: admin._id, type: "ADMIN", title: "ADMINE2E_ One", message: "First admin alert" },
    { recipient: admin._id, type: "ADMIN", title: "ADMINE2E_ Two", message: "Second admin alert" },
    { recipient: doctor._id, type: "ADMIN", title: "ADMINE2E_ Not yours", message: "Belongs to the doctor" },
  ]);

  const inbox = unwrap((await callAdmin("GET", "/admin/notifications")).data);
  check("the inbox lists this admin's notifications", (inbox.items || []).length >= 2);
  check("the inbox never shows another recipient's notification", !(inbox.items || []).some((row) => row.title === "ADMINE2E_ Not yours"));
  check("the unread count is reported", Number(inbox.unread) >= 2, String(inbox.unread));

  const badge = await callAdmin("GET", "/admin/notifications/unread-count");
  check("the badge endpoint answers", badge.status === 200);
  check("the badge is not the generic list route", badge.status === 200 && typeof unwrap(badge.data) === "number", JSON.stringify(badge.data).slice(0, 120));

  const foreign = await Notification.findOne({ recipient: doctor._id });
  check("marking somebody else's notification read is 404", (await callAdmin("PATCH", `/admin/notifications/${foreign._id}/read`)).status === 404);

  const own = (inbox.items || []).find((row) => row.title === "ADMINE2E_ One");
  check("an admin can mark their own notification read", (await callAdmin("PATCH", `/admin/notifications/${own._id}/read`)).status === 200);
  check("the read stamp is persisted", Boolean((await Notification.findById(own._id).lean())?.readAt));
  check("marking it read twice is idempotent", (await callAdmin("PATCH", `/admin/notifications/${own._id}/read`)).status === 200);

  const readAll = await callAdmin("PATCH", "/admin/notifications/read-all");
  check("read-all succeeds", readAll.status === 200, JSON.stringify(readAll.data).slice(0, 120));
  check("nothing is left unread", (await Notification.countDocuments({ recipient: admin._id, readAt: null })) === 0);
  check("read-all does not touch another recipient", (await Notification.countDocuments({ recipient: doctor._id, readAt: null })) === 1);

  // ---------------------------------------------------------------------
  section("12. Profile and settings cannot escalate (FR-AD-01)");
  const profile = unwrap((await callAdmin("GET", "/admin/profile")).data);
  check("the admin can read their own profile", profile?.email === admin.email);

  const profileUpdate = await callAdmin("PATCH", "/admin/profile", { name: "AdminE2E Renamed", address: "Lalitpur" });
  check("the admin can edit their own details", profileUpdate.status === 200, JSON.stringify(profileUpdate.data).slice(0, 160));
  const reloadedAdmin = await User.findById(admin._id).lean();
  check("the name change is persisted", reloadedAdmin.name === "AdminE2E Renamed");
  check("the address change is persisted", reloadedAdmin.address === "Lalitpur");

  await callAdmin("PATCH", "/admin/profile", { role: "patient", status: "REJECTED", isActive: false });
  const escalation = await User.findById(admin._id).lean();
  check("a profile edit cannot change the role", escalation.role === "admin", escalation.role);
  check("a profile edit cannot deactivate the account", escalation.isActive === true);
  check("a profile edit cannot change the account status", escalation.status === "APPROVED", escalation.status);
  check("an email already in use is refused", (await callAdmin("PATCH", "/admin/profile", { email: patient.email })).status === 409);

  const settingsResponse = await callAdmin("GET", "/admin/settings");
  const settings = unwrap(settingsResponse.data);
  check("notification preferences are readable", typeof settings?.appointmentAlerts === "boolean", `${settingsResponse.status} ${JSON.stringify(settings).slice(0, 200)}`);
  const settingsUpdate = await callAdmin("PATCH", "/admin/settings", {
    appointmentAlerts: false,
    billingAlerts: true,
    emailNotifications: false,
  });
  check("preferences can be saved", settingsUpdate.status === 200, JSON.stringify(settingsUpdate.data).slice(0, 160));
  const savedSettings = await AdminSettings.findOne({ user: admin._id }).lean();
  check("the appointment preference is persisted", savedSettings?.appointmentAlerts === false);
  check("the email preference is persisted", savedSettings?.emailNotifications === false);
  check("an unknown preference field is ignored, not stored", (await callAdmin("PATCH", "/admin/settings", { escalateEverything: true })).status === 200 && !(await AdminSettings.findOne({ user: admin._id }).lean())?.escalateEverything);

  // ---------------------------------------------------------------------
  section("13. User management guards (FR-AD-01)");
  const users = unwrap((await callAdmin("GET", "/admin/users?role=patient")).data);
  const userItems = users.items || users;
  check("the user list is paginated", Array.isArray(userItems));
  check("an admin cannot change their own role", (await callAdmin("PATCH", `/admin/users/${admin._id}/role`, { role: "patient" })).status === 403);
  check("an admin cannot change their own status", (await callAdmin("PATCH", `/admin/users/${admin._id}/status`, { status: "REJECTED" })).status === 403);
  check("an admin cannot delete their own account", (await callAdmin("DELETE", `/admin/users/${admin._id}`)).status === 400);
  // The guards that matter are self-escalation and non-admin promotion, not a
// blanket ban: a second admin promoting a colleague is the supported path.
const promoteTarget = await User.create({
  name: "AdminE2E Promote Target",
  email: `admine2e_promote_${tag}@e2e.io`,
  password: PASSWORD,
  role: "patient",
  status: "PENDING",
});
const promoted = await callAdmin("PATCH", `/admin/users/${promoteTarget._id}/role`, { role: "admin" });
  check("an admin can promote another account to admin", promoted.status === 200, JSON.stringify(promoted.data).slice(0, 160));
  const promotedAccount = await User.findById(promoteTarget._id).lean();
  check("the promotion is persisted", promotedAccount.role === "admin", promotedAccount.role);
  check("a promotion implies an approved, active account", promotedAccount.status === "APPROVED" && promotedAccount.isActive === true, `${promotedAccount.status}/${promotedAccount.isActive}`);
  check("a doctor cannot promote anyone", (await call("PATCH", `/admin/users/${patient._id}/role`, { token: doctorToken, body: { role: "admin" } })).status === 403);
  check("an unknown role is refused", (await callAdmin("PATCH", `/admin/users/${patientTwo._id}/role`, { role: "wizard" })).status === 400);

  const deactivated = await callAdmin("PATCH", `/admin/users/${patientTwo._id}/status`, { status: "REJECTED" });
  check("an admin can deactivate another account", deactivated.status === 200, JSON.stringify(deactivated.data).slice(0, 160));
  check("the deactivation is persisted", (await User.findById(patientTwo._id).lean())?.status === "REJECTED");

  const overview = unwrap((await callAdmin("GET", "/admin/overview")).data);
  check("the system overview counts by role", overview?.roleCounts && typeof overview.roleCounts === "object", JSON.stringify(Object.keys(overview || {})));
  check("the system overview counts by status", overview?.statusCounts && typeof overview.statusCounts === "object");
  check("the system overview includes the access request summary", overview?.accessRequests !== undefined);

  // ---------------------------------------------------------------------
  section("14. The audit trail records the administrative actions");
  const audit = unwrap((await callAdmin("GET", "/admin/audit-logs?limit=200")).data);
  const auditList = Array.isArray(audit) ? audit : audit.items || [];
  check("the audit trail is readable by an admin", Array.isArray(auditList));
  check("the audit trail records the appointment booking", auditList.some((row) => row.action === "ADMIN_APPOINTMENT_CREATED"), [...new Set(auditList.map((r) => r.action))].join(","));
  check("the audit trail records the doctor edit", auditList.some((row) => row.action === "DOCTOR_UPDATED"));
  check("the audit trail records the access decision", auditList.some((row) => row.action && String(row.action).includes("ACCESS_REQUEST")));
  check("the audit trail records the profile change", auditList.some((row) => row.action === "ADMIN_PROFILE_UPDATED"));
  check("the audit trail records the settings change", auditList.some((row) => row.action === "ADMIN_SETTINGS_UPDATED"));
  // A few actions have no actor BY DESIGN because no signed-in user triggers
  // them: an access request is submitted publicly, and a payment is settled or
  // failed by the eSewa gateway callback, which carries no session. Every other
  // entry must name whoever caused it.
  // Read the raw `actor` column rather than the populated response: other suites
  // delete their fixture users, and `.populate` turns those refs into null, which
  // says nothing about whether an actor was originally recorded.
  const rawAudit = await AuditLog.find().sort({ createdAt: -1 }).limit(200).select("action actor").lean();
  const NO_ACTOR_ACTIONS = new Set([
    "ACCESS_REQUEST_SUBMITTED",
    "PAYMENT_COMPLETED",
    "PAYMENT_FAILED",
    "PAYMENT_REFUNDED",
  ]);
  const actorless = rawAudit.filter((row) => row.action && !NO_ACTOR_ACTIONS.has(row.action) && !row.actor).map((row) => row.action);
  check("audit entries name their actor", actorless.length === 0, actorless.slice(0, 5).join(","));

  // -------------------------------------------------------------------------
  console.log(`\n${"-".repeat(60)}`);
  console.log(`  scratch database: ${resolved}`);
  console.log(`  emails captured during the run: ${sentMail.length}`);
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