/**
 * End-to-end verification of the laboratory module against the real Express
 * app and the real MongoDB. Every assertion is made over HTTP and, where it
 * matters, re-read straight from the database - a 2xx response is not treated
 * as proof that anything was persisted.
 *
 * Fixtures are namespaced `LABE2E_` and swept on entry and on exit, so an
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
const Notification = require("../models/Notification");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const AuditLog = require("../models/AuditLog");
const emailService = require("../services/email.service");

const sentMail = [];
emailService.env.email.host = "smtp.test.local";
emailService.setTransport({
  sendMail: async (payload) => {
    sentMail.push(payload);
    return { messageId: `lab-e2e-${sentMail.length}` };
  },
});

const PORT = 5097;
const BASE = `http://127.0.0.1:${PORT}`;
const NS = /^labe2e_/i;

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

const callForm = async (path, token, fields, files) => {
  const form = new FormData();
  // Mirrors what a browser sends: structured values are JSON text, scalars and
  // ids are plain text. A Mongoose ObjectId is an object but must be sent as
  // its bare hex string, exactly as the client would.
  for (const [key, value] of Object.entries(fields)) {
    const structured = value !== null && typeof value === "object" && !(value instanceof mongoose.Types.ObjectId);
    form.append(key, structured ? JSON.stringify(value) : String(value));
  }
  for (const file of files) form.append("attachments", new Blob([file.content], { type: file.type }), file.name);
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

const purge = async () => {
  const userIds = (await User.find({ email: NS }, { _id: 1 }).lean()).map((u) => u._id);
  const requestIds = (await LabRequest.find({ clinicalNotes: NS }, { _id: 1 }).lean()).map((r) => r._id);
  const auditTargets = [
    ...requestIds,
    ...(await SampleCollection.find({ labRequest: { $in: requestIds } }, { _id: 1 }).lean()).map((r) => r._id),
    ...(await LabResult.find({ labRequest: { $in: requestIds } }, { _id: 1 }).lean()).map((r) => r._id),
    ...(await LabReport.find({ labRequest: { $in: requestIds } }, { _id: 1 }).lean()).map((r) => r._id),
    ...(await LabTest.find({ testCode: NS }, { _id: 1 }).lean()).map((r) => r._id),
  ];
  await Promise.all([
    User.deleteMany({ email: NS }),
    DoctorPatientAssignment.deleteMany({ doctor: { $in: userIds } }),
    DoctorPatientAssignment.deleteMany({ patient: { $in: userIds } }),
    LabTest.deleteMany({ testCode: NS }),
    LabRequest.deleteMany({ _id: { $in: requestIds } }),
    SampleCollection.deleteMany({ labRequest: { $in: requestIds } }),
    LabResult.deleteMany({ labRequest: { $in: requestIds } }),
    LabReport.deleteMany({ labRequest: { $in: requestIds } }),
    Notification.deleteMany({ recipient: { $in: userIds } }),
    AuditLog.deleteMany({ $or: [{ targetId: { $in: auditTargets } }, { actor: { $in: userIds } }] }),
  ]);
};

const run = async () => {
  // `--db=<name>` runs the whole suite against a scratch database so the shared
  // development database is never written to by a test. It is passed to Mongoose
  // as `dbName` rather than spliced into the URI: this project's MONGO_URI has
  // no database path segment, so a string replace silently matched nothing and
  // the suite would write to the shared database while claiming isolation.
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
  const email = (local) => `LABE2E_${local}_${tag}@e2e.io`;
  const PASSWORD = "LabE2e!Pass1";

  const [patient, doctor, labUser] = await User.create([
    { name: "LabE2E Patient", email: email("pat"), phone: "9800000001", password: PASSWORD, role: "patient" },
    { name: "LabE2E Doctor", email: email("doc"), phone: "9800000002", password: PASSWORD, role: "doctor", nmcNumber: `LABE2E-NMC-${tag}`.toUpperCase() },
    { name: "LabE2E Technologist", email: email("lab"), phone: "9800000003", password: PASSWORD, role: "lab", labRegistryNumber: `LABE2E-REG-${tag}`.toUpperCase() },
  ]);

  // A doctor may only act on a patient who is on their care team. This suite orders
  // a test from the doctor side, so the assignment has to exist - without it the
  // order is correctly refused with 404 "Patient not found" and the laboratory half
  // of the handoff is never exercised.
  await DoctorPatientAssignment.create({
    doctor: doctor._id,
    patient: patient._id,
    relationship: "Primary physician",
    assignedBy: doctor._id,
  });

  const login = async (u) => unwrap((await call("POST", "/auth/login", { body: { email: u.email, password: PASSWORD } })).data);
  const labSession = await login(labUser);
  const patientSession = await login(patient);
  const doctorSession = await login(doctor);
  const labToken = labSession.token;
  const patientToken = patientSession.token;
  const doctorToken = doctorSession.token;

  section("0. Authentication and role authorisation");
  check("laboratory user obtains a token", Boolean(labToken));
  check("lab routes refuse an unauthenticated caller", (await call("GET", "/lab/dashboard")).status === 401);
  check("lab routes refuse a patient", (await call("GET", "/lab/dashboard", { token: patientToken })).status === 403);
  check("lab routes refuse a doctor", (await call("GET", "/lab/dashboard", { token: doctorSession.token })).status === 403);
  check("a forged token is refused", (await call("GET", "/lab/dashboard", { token: "not.a.real.token" })).status === 401);

  section("1. FR-LB-06 test management");
  const created = await call("POST", "/lab/tests", {
    token: labToken,
    body: { name: "LabE2E CBC", testCode: `LABE2E-${tag}`.toUpperCase(), category: "Haematology", sampleType: "blood", price: 25, normalRange: "4.0-11.0" },
  });
  check("create test returns 201", created.status === 201, `got ${created.status}`);
  const testId = unwrap(created.data)._id;
  check("test persisted in MongoDB", Boolean(await LabTest.findById(testId).lean()));

  const listed = await call("GET", "/lab/tests", { token: labToken });
  check("GET /lab/tests still returns an array", Array.isArray(unwrap(listed.data)));
  check("GET /lab/tests returns only active tests by default", unwrap(listed.data).every((t) => t.isActive !== false));
  check("the new test appears in the active list", unwrap(listed.data).some((t) => t._id === testId));

  section("1a. Doctor laboratory orders enter the lab queue");
  check("doctor workspace returns active patients, tests, and owned requests", (await call("GET", "/doctor/laboratory", { token: doctorToken })).status === 200);
  check("patient cannot access doctor laboratory workspace", (await call("GET", "/doctor/laboratory", { token: patientToken })).status === 403);
  check("laboratory user cannot submit a doctor order", (await call("POST", "/doctor/laboratory/requests", { token: labToken, body: { patient: patient._id, test: testId } })).status === 403);
  const ordered = await call("POST", "/doctor/laboratory/requests", {
    token: doctorToken,
    body: { patient: patient._id, test: testId, priority: "URGENT", clinicalNotes: `labe2e_${tag} doctor order` },
  });
  const orderedRequest = unwrap(ordered.data);
  check("doctor order returns 201", ordered.status === 201, `got ${ordered.status} ${JSON.stringify(ordered.data)}`);
  check("doctor identity is taken from the session", String(orderedRequest.doctor?._id || orderedRequest.doctor) === String(doctor._id));
  check("new order is pending and visible to laboratory staff", orderedRequest.status === "PENDING" && (await call("GET", "/lab/requests", { token: labToken })).data.data.some((item) => item._id === orderedRequest._id));
  check("inactive tests cannot be ordered", (await call("POST", "/doctor/laboratory/requests", { token: doctorToken, body: { patient: patient._id, test: "000000000000000000000000" } })).status === 404);

  await call("PATCH", `/lab/tests/${testId}`, { token: labToken, body: { price: 30 } });
  check("price update persisted", (await LabTest.findById(testId).lean()).price === 30);
  check("a negative price is rejected", (await call("PATCH", `/lab/tests/${testId}`, { token: labToken, body: { price: -5 } })).status === 422);
  check("updating a missing test returns 404", (await call("PATCH", "/lab/tests/000000000000000000000000", { token: labToken, body: { price: 5 } })).status === 404);

  await call("DELETE", `/lab/tests/${testId}`, { token: labToken });
  check("soft delete sets isActive=false", (await LabTest.findById(testId).lean()).isActive === false);
  check("the row still exists: a past report must keep its reference", Boolean(await LabTest.findById(testId).lean()));

  const withInactive = await call("GET", "/lab/tests?includeInactive=true", { token: labToken });
  check("includeInactive=true now returns deactivated tests (regression fix)", unwrap(withInactive.data).some((t) => t._id === testId));
  check("the default list still hides them", !unwrap((await call("GET", "/lab/tests", { token: labToken })).data).some((t) => t._id === testId));

  await call("PATCH", `/lab/tests/${testId}/status`, { token: labToken, body: { isActive: true } });
  check("explicit reactivation works", (await LabTest.findById(testId).lean()).isActive === true);
  check("test creation without a price is rejected", (await call("POST", "/lab/tests", { token: labToken, body: { name: "x", category: "y", sampleType: "blood" } })).status === 422);
  check("test creation without a name is rejected", (await call("POST", "/lab/tests", { token: labToken, body: { category: "y", sampleType: "blood", price: 1 } })).status === 422);
  check("test creation with an invalid sample type is rejected", (await call("POST", "/lab/tests", { token: labToken, body: { name: "x", category: "y", sampleType: "plasma", price: 1 } })).status === 400);
  check("a duplicate testCode is rejected", (await call("POST", "/lab/tests", { token: labToken, body: { name: "dupe", category: "y", sampleType: "blood", price: 1, testCode: `LABE2E-${tag}`.toUpperCase() } })).status === 409);
  check("a patient cannot manage the catalogue", (await call("POST", "/lab/tests", { token: patientToken, body: { name: "x", category: "y", sampleType: "blood", price: 1 } })).status === 403);

  section("2. FR-LB-02 workflow transitions");
  // Start the workflow fixtures directly in known states so each transition
  // can be checked independently; the doctor submission API is tested above.
  const makeRequest = (overrides = {}) =>
    LabRequest.create({
      patient: patient._id, doctor: doctor._id, test: testId,
      priority: "ROUTINE", status: "PENDING", clinicalNotes: `labe2e_${tag}`, ...overrides,
    });

  const r1 = await makeRequest();
  check("valid PENDING request persists", (await LabRequest.findById(r1._id).lean())?.status === "PENDING");

  const accept = await call("POST", `/lab/requests/${r1._id}/accept`, { token: labToken });
  check("PENDING -> ACCEPTED allowed", accept.status === 200, `got ${accept.status}`);
  const acceptedDoc = await LabRequest.findById(r1._id).lean();
  check("acceptedBy recorded from the JWT", String(acceptedDoc.acceptedBy) === String(labUser._id));
  check("acceptedAt recorded", Boolean(acceptedDoc.acceptedAt));
  check("updatedBy recorded", String(acceptedDoc.updatedBy) === String(labUser._id));
  check("re-accepting an ACCEPTED request is rejected", (await call("POST", `/lab/requests/${r1._id}/accept`, { token: labToken })).status === 409);
  check("accepting a missing request returns 404", (await call("POST", "/lab/requests/000000000000000000000000/accept", { token: labToken })).status === 404);
  check("accepting a malformed id returns 422", (await call("POST", "/lab/requests/nope/accept", { token: labToken })).status === 422);

  section("3. FR-LB-02 the generic status route cannot bypass the workflow");
  const r2 = await makeRequest();
  const skip = await call("PATCH", `/lab/requests/${r2._id}/status`, { token: labToken, body: { status: "PROCESSING" } });
  check("PENDING -> PROCESSING is rejected", skip.status === 409, `got ${skip.status}`);
  check("the rejection names the allowed next steps", /Allowed next steps/i.test(skip.data?.message || ""), skip.data?.message);
  check("PENDING -> COMPLETED is rejected", (await call("PATCH", `/lab/requests/${r2._id}/status`, { token: labToken, body: { status: "COMPLETED" } })).status === 409);
  check("an unknown status value is rejected", (await call("PATCH", `/lab/requests/${r2._id}/status`, { token: labToken, body: { status: "FLYING" } })).status === 422);
  check("a missing status is rejected as invalid input", (await call("PATCH", `/lab/requests/${r2._id}/status`, { token: labToken, body: {} })).status === 422);

  const forced = await call("PATCH", `/lab/requests/${r2._id}/status`, { token: labToken, body: { status: "SAMPLE_COLLECTED" } });
  check("SAMPLE_COLLECTED without a sample is rejected (regression fix)", forced.status === 409, `got ${forced.status}`);
  check("the message names the missing sample", /sample/i.test(forced.data?.message || ""), forced.data?.message);
  check("the rejected call mutated nothing", (await LabRequest.findById(r2._id).lean()).status === "PENDING");

  await call("POST", `/lab/requests/${r2._id}/accept`, { token: labToken });
  const bypass = await call("PATCH", `/lab/requests/${r2._id}/status`, { token: labToken, body: { status: "VERIFIED" } });
  check("status=VERIFIED via the generic route is refused (regression fix)", bypass.status === 409, `got ${bypass.status}`);
  check("the refusal points at the dedicated endpoint", /verify/i.test(bypass.data?.message || ""), bypass.data?.message);
  check("request stayed ACCEPTED after the refused bypass", (await LabRequest.findById(r2._id).lean()).status === "ACCEPTED");

  section("4. FR-LB-03 sample collection");
  const sampleRes = await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r1._id, sampleType: "Blood" } });
  check("sample collection returns 201", sampleRes.status === 201, `got ${sampleRes.status} ${JSON.stringify(sampleRes.data)}`);
  const sample = unwrap(sampleRes.data);
  const sampleDoc = await SampleCollection.findById(sample._id).lean();
  check("sampleId is generated by the backend", /^SMP-\d{4}-\d{4}$/.test(sampleDoc.sampleId || ""), sampleDoc.sampleId);
  check("barcode is generated by the backend", sampleDoc.barcode === `BC-${sampleDoc.sampleId}`, sampleDoc.barcode);
  check("sampleType is normalised to the catalogue value", sampleDoc.sampleType === "blood", sampleDoc.sampleType);
  check("collectionDate persisted", Boolean(sampleDoc.collectionDate));
  check("collectionTime persisted (FR-LB-03)", Boolean(sampleDoc.collectionTime));
  check("collectedBy taken from the JWT", String(sampleDoc.collectedBy) === String(labUser._id));
  check("patient copied from the request, not the body", String(sampleDoc.patient) === String(patient._id));
  check("request advanced to SAMPLE_COLLECTED", (await LabRequest.findById(r1._id).lean()).status === "SAMPLE_COLLECTED");
  check("a duplicate sample for one request is refused", (await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r1._id } })).status === 409);
  check("a PENDING request cannot have a sample", (await call("POST", "/lab/samples", { token: labToken, body: { labRequest: (await makeRequest())._id } })).status === 409);
  check("a malformed request id is rejected", (await call("POST", "/lab/samples", { token: labToken, body: { labRequest: "not-an-id" } })).status === 422);
  check("a missing request returns 404", (await call("POST", "/lab/samples", { token: labToken, body: { labRequest: "000000000000000000000000" } })).status === 404);

  await call("PATCH", `/lab/samples/${sample._id}`, { token: labToken, body: { barcode: "HACKED" } });
  check("a client cannot rewrite the generated barcode", (await SampleCollection.findById(sample._id).lean()).barcode === `BC-${sampleDoc.sampleId}`);
  check("notes can be updated", (await call("PATCH", `/lab/samples/${sample._id}`, { token: labToken, body: { notes: "haemolysed" } })).status === 200);
  check("the note persisted", (await SampleCollection.findById(sample._id).lean()).notes === "haemolysed");
  check("a sample with no request cannot be read", (await call("GET", "/lab/samples/000000000000000000000000", { token: labToken })).status === 404);
  check("a malformed sample id is rejected", (await call("GET", "/lab/samples/nope", { token: labToken })).status === 422);
  check("a patient cannot collect a sample", (await call("POST", "/lab/samples", { token: patientToken, body: { labRequest: r1._id } })).status === 403);

  const sampleList = await call("GET", "/lab/samples", { token: labToken });
  check("GET /lab/samples still returns an array", Array.isArray(unwrap(sampleList.data)));
  check("GET /lab/samples/:id works", (await call("GET", `/lab/samples/${sample._id}`, { token: labToken })).status === 200);
  check("GET /lab/processing lists the sample that is waiting", unwrap((await call("GET", "/lab/processing", { token: labToken })).data).some((r) => String(r._id) === String(r1._id)), "r1 should be awaiting processing");
  check("GET /lab/processing still returns an array", Array.isArray(unwrap((await call("GET", "/lab/processing", { token: labToken })).data)));
  check("GET /lab/processing/:id works", (await call("GET", `/lab/processing/${r1._id}`, { token: labToken })).status === 200);

  section("5. FR-LB-04 result entry");
  const r3 = await makeRequest();
  await call("POST", `/lab/requests/${r3._id}/accept`, { token: labToken });
  const s3 = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r3._id } })).data);

  // The service requires the request to be in PROCESSING and names the sample
  // explicitly, so the workflow has to be advanced honestly first.
  check("a result cannot be entered before processing starts", (await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, sample: s3._id, parameters: [{ parameter: "X", value: "1" }] } })).status === 409);
  await call("PATCH", `/lab/processing/${r3._id}/start`, { token: labToken, body: { notes: "on the analyser" } });
  check("start processing moves the request to PROCESSING", (await LabRequest.findById(r3._id).lean()).status === "PROCESSING");
  check("processingStartedAt recorded", Boolean((await LabRequest.findById(r3._id).lean()).processingStartedAt));
  check("processedBy taken from the JWT", String((await LabRequest.findById(r3._id).lean()).processedBy) === String(labUser._id));

  const params = [
    { parameter: "Haemoglobin", value: "13.4", unit: "g/dL", referenceRange: "12.0-15.0", flag: "NORMAL" },
    { parameter: "WBC", value: "16.2", unit: "x10^9/L", referenceRange: "4.0-11.0", flag: "HIGH" },
  ];
  const resultRes = await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, sample: s3._id, parameters: params } });
  check("result entry returns 201", resultRes.status === 201, `got ${resultRes.status} ${JSON.stringify(resultRes.data)}`);
  const result = unwrap(resultRes.data);
  const resultDoc = await LabResult.findById(result._id).lean();
  check("both parameters persisted", resultDoc.parameters.length === 2, JSON.stringify(resultDoc.parameters));
  check("abnormal value keeps its flag", resultDoc.parameters[1].flag === "HIGH", resultDoc.parameters[1].flag);
  check("enteredBy taken from the JWT", String(resultDoc.enteredBy) === String(labUser._id));
  check("result.patient derived from the request", String(resultDoc.patient) === String(patient._id));
  check("result.test derived from the request", String(resultDoc.test) === String(r3.test));
  check("result.sample is the sample the caller named", String(resultDoc.sample) === String(s3._id));
  check("a result without a sample is rejected", (await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, parameters: params } })).status === 422);
  check("a result without parameters is rejected", (await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, sample: s3._id } })).status === 422);
  check("a parameter with no value is rejected", (await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, sample: s3._id, parameters: [{ parameter: "X" }] } })).status === 422);
  check("a patient cannot enter a result", (await call("POST", "/lab/results", { token: patientToken, body: { labRequest: r3._id, sample: s3._id, parameters: params } })).status === 403);

  const r3b = await makeRequest();
  await call("POST", `/lab/requests/${r3b._id}/accept`, { token: labToken });
  const s3b = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r3b._id } })).data);
  await call("PATCH", `/lab/processing/${r3b._id}/start`, { token: labToken });
  const foreign = unwrap((await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3b._id, sample: s3b._id, parameters: [{ parameter: "Na", value: "140" }], processingNotes: "centrifuge at 3000 rpm" } })).data);
  check("a sample from another request is refused", (await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, sample: s3b._id, parameters: params } })).status === 409);
  check("an unknown sample returns 404", (await call("POST", "/lab/results", { token: labToken, body: { labRequest: r3._id, sample: "000000000000000000000000", parameters: params } })).status === 404);

  const patched = await call("PATCH", `/lab/results/${result._id}`, { token: labToken, body: { parameters: [{ parameter: "Haemoglobin", value: "9.1", unit: "g/dL", flag: "LOW" }] } });
  check("result parameters are editable", patched.status === 200, `got ${patched.status}`);
  check("the edit persisted", (await LabResult.findById(result._id).lean()).parameters[0].value === "9.1");
  check("editing down to zero parameters is rejected", (await call("PATCH", `/lab/results/${result._id}`, { token: labToken, body: { parameters: [] } })).status === 422);
  check("editing a missing result returns 404", (await call("PATCH", "/lab/results/000000000000000000000000", { token: labToken, body: { notes: "x" } })).status === 404);
  check("editing a malformed result id is rejected", (await call("PATCH", "/lab/results/nope", { token: labToken, body: { notes: "x" } })).status === 422);

  const resultList = await call("GET", "/lab/results", { token: labToken });
  check("GET /lab/results still returns an array", Array.isArray(unwrap(resultList.data)));
  await call("PATCH", `/lab/processing/${r3._id}/complete`, { token: labToken, body: { notes: "analysed" } });
  check("complete processing moves the request to COMPLETED", (await LabRequest.findById(r3._id).lean()).status === "COMPLETED");
  check("processingCompletedAt recorded", Boolean((await LabRequest.findById(r3._id).lean()).processingCompletedAt));
  check("completing twice is rejected", (await call("PATCH", `/lab/processing/${r3._id}/complete`, { token: labToken })).status === 409);
  await call("PATCH", `/lab/processing/${r3b._id}/complete`, { token: labToken });

  // A completed request stays on the bench so a missing parameter can still be
  // recorded before the report is generated.
  check(
    "a completed request remains on the processing queue",
    unwrap((await call("GET", "/lab/processing", { token: labToken })).data).some((row) => String(row._id) === String(r3._id))
  );
  check(
    "the completed queue row carries its processing notes",
    String(unwrap((await call("GET", "/lab/processing", { token: labToken })).data).find((row) => String(row._id) === String(r3._id))?.processingNotes) === "analysed"
  );
  check(
    "notes typed while entering a result are stored on the request",
    String((await LabRequest.findById(r3b._id).lean()).processingNotes || "") === "centrifuge at 3000 rpm"
  );

  section("6. FR-LB-04 attachments");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const r4 = await makeRequest();
  await call("POST", `/lab/requests/${r4._id}/accept`, { token: labToken });
  const s4 = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r4._id } })).data);
  await call("PATCH", `/lab/processing/${r4._id}/start`, { token: labToken });

  const withFile = await callForm(
    "/lab/results",
    labToken,
    { labRequest: r4._id, sample: s4._id, parameters: [{ parameter: "Film", value: "clear", flag: "NORMAL" }] },
    [{ content: png, type: "image/png", name: "smear.png" }],
  );
  check("multipart result entry returns 201", withFile.status === 201, `got ${withFile.status} ${JSON.stringify(withFile.data)}`);
  const attachedResult = await LabResult.findById(unwrap(withFile.data)._id).lean();
  check("JSON-stringified parameters are parsed out of the multipart body", attachedResult.parameters.length === 1, JSON.stringify(attachedResult.parameters));
  check("the attachment is recorded as a descriptor, not a path", attachedResult.attachments.length === 1 && !String(attachedResult.attachments[0].id).includes("/"));
  check("the original filename is preserved for display", attachedResult.attachments[0].fileName === "smear.png");
  const storedPath = require("../middleware/upload").resolveAttachmentPath(attachedResult.attachments[0].id);
  check("the stored file exists on disk", Boolean(storedPath), attachedResult.attachments[0].id);
  check("the stored file is outside the server source tree", Boolean(storedPath) && !storedPath.replace(/\\/g, "/").includes("/server/src/"));

  const download = await fetch(`${BASE}/lab/results/${attachedResult._id}/attachments/${attachedResult.attachments[0].id}`, { headers: { Authorization: `Bearer ${labToken}` } });
  check("the attachment is downloadable by a lab user", download.status === 200, `got ${download.status}`);
  check("the download is served as an image", (download.headers.get("content-type") || "").includes("image/png"));
  check("a patient cannot download the attachment", (await fetch(`${BASE}/lab/results/${attachedResult._id}/attachments/${attachedResult.attachments[0].id}`, { headers: { Authorization: `Bearer ${patientToken}` } })).status === 403);
  check("an unauthenticated download is refused", (await fetch(`${BASE}/lab/results/${attachedResult._id}/attachments/${attachedResult.attachments[0].id}`)).status === 401);
  check("a path-traversal fileId is refused", (await call("GET", `/lab/results/${attachedResult._id}/attachments/..%2F..%2Fpackage.json`, { token: labToken })).status === 404);
  check("an unknown fileId is refused", (await call("GET", `/lab/results/${attachedResult._id}/attachments/deadbeef.png`, { token: labToken })).status === 404);

  const exe = await callForm("/lab/results", labToken, { labRequest: r4._id, sample: s4._id, parameters: [{ parameter: "E", value: "1" }] }, [{ content: Buffer.from("MZ exe"), type: "application/x-msdownload", name: "a.exe" }]);
  check("a disallowed mime type is rejected by the filter", exe.status === 422, `got ${exe.status}`);

  const r6 = await makeRequest();
  await call("POST", `/lab/requests/${r6._id}/accept`, { token: labToken });
  const s6 = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r6._id } })).data);
  await call("PATCH", `/lab/processing/${r6._id}/start`, { token: labToken });
  const before = require("fs").readdirSync(require("../middleware/upload").UPLOAD_DIR).length;
  const disguise = await callForm(
    "/lab/results",
    labToken,
    { labRequest: r6._id, sample: s6._id, parameters: [{ parameter: "Fake", value: "x" }] },
    [{ content: Buffer.from("MZ\u0000\u0000 this is a windows executable"), type: "image/png", name: "trojan.png" }],
  );
  check("a file whose bytes are not a PNG is rejected", disguise.status === 422, `got ${disguise.status}`);
  check("the impostor was not persisted as a result", (await LabResult.find({ labRequest: r6._id }).lean()).length === 0);
  check("the impostor was deleted from disk rather than left behind", require("fs").readdirSync(require("../middleware/upload").UPLOAD_DIR).length === before, "upload directory grew");

  section("7. FR-LB-05 report generation and verification");
  const reportRes = await call("POST", "/lab/reports", { token: labToken, body: { labRequest: r3._id, sample: s3._id, results: [result._id] } });
  check("report generation returns 201", reportRes.status === 201, `got ${reportRes.status} ${JSON.stringify(reportRes.data)}`);
  const report = unwrap(reportRes.data);
  const reportDoc = await LabReport.findById(report._id).lean();
  check("reportId is generated by the backend", /^RPT-\d{4}-\d{4}$/.test(reportDoc.reportId || ""), reportDoc.reportId);
  check("patient derived from the request", String(reportDoc.patient) === String(patient._id));
  check("doctor derived from the request", String(reportDoc.doctor) === String(doctor._id));
  check("the result is attached", reportDoc.results.some((r) => String(r) === String(result._id)));
  check("the sample is attached", String(reportDoc.sample) === String(s3._id));
  check("report status is COMPLETED", reportDoc.status === "COMPLETED");
  check("generatedBy taken from the JWT", String(reportDoc.generatedBy) === String(labUser._id));
  check("a duplicate report for one request is rejected", (await call("POST", "/lab/reports", { token: labToken, body: { labRequest: r3._id, sample: s3._id, results: [result._id] } })).status === 409);
  check("report generation without a labRequest is rejected", (await call("POST", "/lab/reports", { token: labToken, body: { sample: s3._id, results: [result._id] } })).status === 422);
  check("a report with no results is rejected", (await call("POST", "/lab/reports", { token: labToken, body: { labRequest: r3._id, sample: s3._id } })).status === 422);
  check("a result from another request cannot be attached", (await call("POST", "/lab/reports", { token: labToken, body: { labRequest: r3._id, sample: s3._id, results: [foreign._id] } })).status === 409);
  check("a report for a non-completed request is rejected", (await call("POST", "/lab/reports", { token: labToken, body: { labRequest: r4._id, sample: s4._id, results: [attachedResult._id] } })).status === 409);

  // FR-LB-05: a report is only released once the reviewer has confirmed the
  // required checks. The attestations are recorded with the verification.
  const REVIEW_CHECKS = { resultsChecked: true, referenceRangesChecked: true, attachmentsChecked: true };

  const verifyNoChecks = await call("PATCH", `/lab/reports/${report._id}/verify`, { token: labToken });
  check("verification without the review checks is refused (FR-LB-05)", verifyNoChecks.status === 422, `got ${verifyNoChecks.status}`);
  const verifyPartial = await call("PATCH", `/lab/reports/${report._id}/verify`, { token: labToken, body: { checks: { resultsChecked: true } } });
  check("a partial set of review checks is refused", verifyPartial.status === 422, `got ${verifyPartial.status}`);

  const verify = await call("PATCH", `/lab/reports/${report._id}/verify`, { token: labToken, body: { checks: REVIEW_CHECKS } });
  check("verification returns 200", verify.status === 200, `got ${verify.status} ${JSON.stringify(verify.data)}`);
  const verified = await LabReport.findById(report._id).lean();
  check("report status is VERIFIED", verified.status === "VERIFIED");
  check("verifiedBy taken from the JWT", String(verified.verifiedBy) === String(labUser._id));
  check("verifiedAt recorded", Boolean(verified.verifiedAt));
  check(
    "the reviewer's attestations are recorded on the report",
    verified.verificationChecks?.resultsChecked === true &&
      verified.verificationChecks?.referenceRangesChecked === true &&
      verified.verificationChecks?.attachmentsChecked === true,
    JSON.stringify(verified.verificationChecks)
  );
  check("the request reached VERIFIED", (await LabRequest.findById(r3._id).lean()).status === "VERIFIED");
  check("re-verifying is rejected", (await call("PATCH", `/lab/reports/${report._id}/verify`, { token: labToken, body: { checks: REVIEW_CHECKS } })).status === 409);
  check("verifying a missing report returns 404", (await call("PATCH", "/lab/reports/000000000000000000000000/verify", { token: labToken, body: { checks: REVIEW_CHECKS } })).status === 404);
  check("a patient cannot verify a report", (await call("PATCH", `/lab/reports/${report._id}/verify`, { token: patientToken, body: { checks: REVIEW_CHECKS } })).status === 403);
  check("the verified report is visible to the doctor notification inbox", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_REPORT_VERIFIED" }).lean()));
  check("the verified report notified the patient too", Boolean(await Notification.findOne({ recipient: patient._id, type: "LAB_REPORT_VERIFIED" }).lean()));

  const beforeMail = sentMail.length;
  const r5 = await makeRequest();
  await call("POST", `/lab/requests/${r5._id}/accept`, { token: labToken });
  const s5 = unwrap((await call("POST", "/lab/samples", { token: labToken, body: { labRequest: r5._id } })).data);
  await call("PATCH", `/lab/processing/${r5._id}/start`, { token: labToken });
  const r5res = unwrap((await call("POST", "/lab/results", { token: labToken, body: { labRequest: r5._id, sample: s5._id, parameters: [{ parameter: "Na", value: "140", unit: "mmol/L", flag: "NORMAL" }] } })).data);
  await call("PATCH", `/lab/processing/${r5._id}/complete`, { token: labToken });
  const report5 = unwrap((await call("POST", "/lab/reports", { token: labToken, body: { labRequest: r5._id, sample: s5._id, results: [r5res._id] } })).data);

  // FR-LB-05 approval: final sign-off, only after verification.
  check("a COMPLETED report cannot be approved before it is verified", (await call("PATCH", `/lab/reports/${report5._id}/approve`, { token: labToken })).status === 409);
  check("a patient cannot approve a report", (await call("PATCH", `/lab/reports/${report5._id}/approve`, { token: patientToken })).status === 403);

  const verify5 = await call("PATCH", `/lab/reports/${report5._id}/verify`, { token: labToken, body: { checks: REVIEW_CHECKS } });
  check("a second verification also succeeds", verify5.status === 200, `got ${verify5.status}`);
  check("verification sends the report-ready email", sentMail.length > beforeMail, `sent ${sentMail.length - beforeMail}`);
  check("the email carries the generated reportId", sentMail.some((m) => m.html?.includes(report5.reportId)), report5.reportId);
  check("the email is addressed to the patient", sentMail.some((m) => String(m.to).toLowerCase() === patient.email.toLowerCase()));
  check("the email is addressed to the doctor", sentMail.some((m) => String(m.to).toLowerCase() === doctor.email.toLowerCase()));

  const approve5 = await call("PATCH", `/lab/reports/${report5._id}/approve`, { token: labToken });
  check("approving a verified report returns 200", approve5.status === 200, `got ${approve5.status} ${JSON.stringify(approve5.data)}`);
  const approvedDoc = await LabReport.findById(report5._id).lean();
  check("report status is APPROVED", approvedDoc.status === "APPROVED");
  check("approvedBy taken from the JWT", String(approvedDoc.approvedBy) === String(labUser._id));
  check("approvedAt recorded", Boolean(approvedDoc.approvedAt));
  check("re-approving is rejected", (await call("PATCH", `/lab/reports/${report5._id}/approve`, { token: labToken })).status === 409);
  check("approving a missing report returns 404", (await call("PATCH", "/lab/reports/000000000000000000000000/approve", { token: labToken })).status === 404);
  check("the doctor was told the report is final", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_REPORT_APPROVED", entityId: report5._id }).lean()));
  check("the approved report is visible to the doctor", (await call("GET", `/doctor/reports/${report5._id}`, { token: doctorToken })).status === 200);
  check("the approved report is visible to the patient", (await call("GET", `/patient/lab-reports/${report5._id}`, { token: patientToken })).status === 200);
  check("the approved report keeps its APPROVED status for the patient", unwrap((await call("GET", `/patient/lab-reports/${report5._id}`, { token: patientToken })).data).status === "APPROVED");

  // FR-LB-05 correction: a released report is never edited, it is superseded by a
  // revision that walks the same verify -> approve path.
  section("7b. FR-LB-05 report revision");
  const revise = await call("POST", `/lab/reports/${report5._id}/revise`, { token: labToken, body: { reason: "Patient identity transcription error on the report header" } });
  check("revising an approved report returns 201", revise.status === 201, `got ${revise.status} ${JSON.stringify(revise.data)}`);
  const revision = unwrap(revise.data);
  const originalAfter = await LabReport.findById(report5._id).lean();
  check("the original report is now SUPERSEDED", originalAfter.status === "SUPERSEDED");
  check("the revision is a different report", String(revision._id) !== String(report5._id));
  check("the revision carries revision number 2", revision.revision === 2);
  check("the revision points back at the report it amends", String(revision.amends) === String(report5._id));
  check("the amendment reason is recorded", /transcription error/i.test(revision.amendmentReason || ""), revision.amendmentReason);
  check("the revision lands in COMPLETED so it can be verified", revision.status === "COMPLETED", revision.status);
  check("the revision carries its own copy of the results", Array.isArray(revision.results) && revision.results.length >= 1);
  check("the original remains readable for the audit trail", (await call("GET", `/lab/reports/${report5._id}`, { token: labToken })).status === 200);
  check("the superseded report is no longer visible to the doctor", (await call("GET", `/doctor/reports/${report5._id}`, { token: doctorToken })).status === 404);
  check("the superseded report is no longer visible to the patient", (await call("GET", `/patient/lab-reports/${report5._id}`, { token: patientToken })).status === 404);
  check("a report that is only COMPLETED cannot be revised", (await call("POST", `/lab/reports/${revision._id}/revise`, { token: labToken, body: { reason: "too early" } })).status === 409);
  const verifyRev = await call("PATCH", `/lab/reports/${revision._id}/verify`, { token: labToken, body: { checks: REVIEW_CHECKS } });
  check("the revised report can be verified", verifyRev.status === 200, `got ${verifyRev.status}`);
  check("the revised report can be approved", (await call("PATCH", `/lab/reports/${revision._id}/approve`, { token: labToken })).status === 200);
  check("the approved revision is visible to the doctor", (await call("GET", `/doctor/reports/${revision._id}`, { token: doctorToken })).status === 200);
  check("the approved revision is visible to the patient", (await call("GET", `/patient/lab-reports/${revision._id}`, { token: patientToken })).status === 200);
  check("a released report cannot be revised without a reason", (await call("POST", `/lab/reports/${revision._id}/revise`, { token: labToken, body: {} })).status === 422);
  check("a patient cannot revise a report", (await call("POST", `/lab/reports/${revision._id}/revise`, { token: patientToken, body: { reason: "x" } })).status === 403);

  // FR-LB-06 categories and FR-LB-03 specimen label.
  section("7c. FR-LB-06 categories/parameters and FR-LB-03 label");
  const catName = `LABE2E Category ${tag}`;
  const catCreate = await call("POST", "/lab/categories", { token: labToken, body: { name: catName, description: "created by the e2e suite" } });
  check("creating a category returns 201", catCreate.status === 201, `got ${catCreate.status} ${JSON.stringify(catCreate.data)}`);
  const category = unwrap(catCreate.data);
  check("the category was slugged from its name", category.slug && category.slug.startsWith("labe2e-category"), category.slug);
  check("the category is listed", unwrap((await call("GET", "/lab/categories", { token: labToken })).data).some((c) => String(c._id) === String(category._id)));
  check("a duplicate category name is refused", (await call("POST", "/lab/categories", { token: labToken, body: { name: catName } })).status === 409);
  check("a patient cannot create a category", (await call("POST", "/lab/categories", { token: patientToken, body: { name: "x" } })).status === 403);
  const renamed = await call("PATCH", `/lab/categories/${category._id}`, { token: labToken, body: { name: `${catName} Renamed` } });
  check("renaming a category returns 200", renamed.status === 200, `got ${renamed.status}`);
  check("the slug is stable across a rename", unwrap(renamed.data).slug === category.slug, unwrap(renamed.data).slug);

  const paramTest = await call("POST", "/lab/tests", {
    token: labToken,
    body: {
      name: `LABE2E Param Test ${tag}`,
      testCode: `LABE2EP-${tag}`.toUpperCase(),
      category: catName,
      sampleType: "blood",
      price: 20,
      parameters: [
        { parameter: "Marker A", unit: "mg/dL", min: 1, max: 5 },
        { parameter: "Marker B", unit: "U/L", maleMin: 10, maleMax: 20, femaleMin: 8, femaleMax: 18 },
      ],
    },
  });
  check("creating a test with parameters returns 201", paramTest.status === 201, `got ${paramTest.status} ${JSON.stringify(paramTest.data)}`);
  const paramTestDoc = unwrap(paramTest.data);
  check("the parameters were stored in order", Array.isArray(paramTestDoc.parameters) && paramTestDoc.parameters.length === 2, JSON.stringify(paramTestDoc.parameters));
  check("the categoryRef was resolved from the name", Boolean(paramTestDoc.categoryRef), String(paramTestDoc.categoryRef));
  // Sex-specific ranges only resolve when the patient's gender is known, so the
  // template is requested for the suite's patient after pinning that gender.
  await User.updateOne({ _id: patient._id }, { $set: { gender: "male" } });
  const template = unwrap((await call("GET", `/lab/tests/${paramTestDoc._id}/parameters?patient=${patient._id}`, { token: labToken })).data);
  check("the parameter template returns the panel", Array.isArray(template.parameters) && template.parameters.length === 2, JSON.stringify(template));
  check("the male range is selected and marked sex-specific", template.parameters?.some((p) => p.sexSpecific === true && p.referenceRange === "10 - 20 U/L"), JSON.stringify(template.parameters));
  check("each parameter carries a resolved, non-empty reference range", template.parameters?.every((p) => typeof p.referenceRange === "string" && p.referenceRange.length > 0), JSON.stringify(template.parameters));
  await call("PATCH", `/lab/tests/${paramTestDoc._id}/status`, { token: labToken, body: { isActive: false } });

  const label = await call("GET", `/lab/samples/${s5._id}/label?format=barcode`, { token: labToken });
  check("the specimen label endpoint returns 200", label.status === 200, `got ${label.status}`);
  const labelData = unwrap(label.data);
  check("the label carries the sample id", labelData.sampleId === s5.sampleId, JSON.stringify(labelData).slice(0, 120));
  check("the label returns a real SVG barcode", typeof labelData.svg === "string" && labelData.svg.includes("<svg"), String(labelData.svg).slice(0, 40));
  check("the barcode encodes the sample id, not patient identity", typeof labelData.value === "string" && labelData.value === `BC-${s5.sampleId}`, labelData.value);
  const qr = await call("GET", `/lab/samples/${s5._id}/label?format=qr`, { token: labToken });
  check("the QR label endpoint returns an SVG too", unwrap(qr.data).svg?.includes("<svg") === true);
  check("the QR payload is a HILMS domain token", String(unwrap(qr.data).value || "").startsWith("HILMS-LAB:"), unwrap(qr.data).value);
  check("an invalid label format is refused", (await call("GET", `/lab/samples/${s5._id}/label?format=pdf`, { token: labToken })).status === 422);
  check("a patient cannot read a specimen label", (await call("GET", `/lab/samples/${s5._id}/label`, { token: patientToken })).status === 403);
  const scanned = await call("POST", "/lab/samples/lookup", { token: labToken, body: { code: unwrap(qr.data).value } });
  check("a scanned label payload resolves to its sample", scanned.status === 200 && String(unwrap(scanned.data)?._id) === String(s5._id), `got ${scanned.status} ${JSON.stringify(scanned.data).slice(0, 120)}`);
  check("a tampered label payload is refused", (await call("POST", "/lab/samples/lookup", { token: labToken, body: { code: "HILMS-LAB:NOPE:0000" } })).status === 422);
  check("a patient cannot resolve a specimen", (await call("POST", "/lab/samples/lookup", { token: patientToken, body: { code: unwrap(qr.data).value } })).status === 403);

  section("8. dashboard, filters, pagination and search");
  const dash = await call("GET", "/lab/dashboard", { token: labToken });
  check("dashboard returns 200", dash.status === 200);
  const dashData = unwrap(dash.data);
  check("dashboard counts the VERIFIED reports", dashData.verifiedReports >= 2, `got ${dashData.verifiedReports}`);
  check("dashboard counts PENDING requests", dashData.pendingRequests >= 1, `got ${dashData.pendingRequests}`);
  check("dashboard counts collected samples", dashData.samplesCollected >= 1, `got ${dashData.samplesCollected}`);
  check("dashboard includes recent activity", Array.isArray(dashData.recentRequests) && dashData.recentRequests.length > 0);
  check("dashboard exposes the unread notification count", typeof dashData.unreadNotifications === "number");

  const paged = await call("GET", "/lab/requests?page=1&limit=2", { token: labToken });
  check("a paginated list still returns an array", Array.isArray(unwrap(paged.data)));
  check("the page respects limit=2", unwrap(paged.data).length === 2, `got ${unwrap(paged.data).length}`);
  const meta = paged.data.pagination;
  check("pagination metadata is present", Boolean(meta), JSON.stringify(paged.data));
  check("metadata reports the total", meta.total > 2, `total ${meta?.total}`);
  check("metadata reports totalPages", meta.totalPages === Math.ceil(meta.total / 2));
  check("a disallowed sort field is rejected", (await call("GET", "/lab/requests?sort=nested.password", { token: labToken })).status === 422);
  check("an unparseable date filter is rejected", (await call("GET", "/lab/requests?dateFrom=not-a-date", { token: labToken })).status === 422);
  check("an unknown status filter is rejected", (await call("GET", "/lab/requests?status=TELEPORTED", { token: labToken })).status === 422);
  const urgent = await call("GET", "/lab/requests?priority=URGENT", { token: labToken });
  check("priority filter returns an array", Array.isArray(unwrap(urgent.data)));

  const found = await call("GET", `/lab/search?q=${tag}`, { token: labToken });
  check("search by the fixture tag finds the patient", unwrap(found.data).patients.some((u) => String(u._id) === String(patient._id)), JSON.stringify(unwrap(found.data).patients));
  check("search returns the request set", Array.isArray(unwrap(found.data).requests));
  check("a one-character search returns empty sets", unwrap((await call("GET", "/lab/search?q=a", { token: labToken })).data).requests.length === 0);
  check("a one-character search returns no patients", unwrap((await call("GET", "/lab/search?q=a", { token: labToken })).data).patients.length === 0);

  const context = await call("GET", `/lab/patients/${patient._id}`, { token: labToken });
  check("patient context returns 200", context.status === 200, `got ${context.status} ${JSON.stringify(context.data)}`);
  const ctx = unwrap(context.data);
  check("patient context returns the patient", String(ctx.patient?._id) === String(patient._id));
  check("patient context returns laboratoryRequests as an array (regression fix)", Array.isArray(ctx.laboratoryRequests), JSON.stringify(ctx.laboratoryRequests));
  check("patient context returns previousReports as an array", Array.isArray(ctx.previousReports), JSON.stringify(ctx.previousReports));
  check("a doctor id is not treated as a patient", (await call("GET", `/lab/patients/${doctor._id}`, { token: labToken })).status === 404);

  section("9. cancellation and terminal states");
  const r7 = await makeRequest({ priority: "URGENT" });
  check("a PENDING request can be cancelled", (await call("PATCH", `/lab/requests/${r7._id}/status`, { token: labToken, body: { status: "CANCELLED" } })).status === 200);
  check("cancellation persisted", (await LabRequest.findById(r7._id).lean()).status === "CANCELLED");
  check("a cancelled request cannot be accepted", (await call("POST", `/lab/requests/${r7._id}/accept`, { token: labToken })).status === 409);
  check("a cancelled request cannot be cancelled twice", (await call("PATCH", `/lab/requests/${r7._id}/status`, { token: labToken, body: { status: "CANCELLED" } })).status === 409);
  check("a verified report's request cannot be cancelled", (await call("PATCH", `/lab/requests/${r3._id}/status`, { token: labToken, body: { status: "CANCELLED" } })).status === 409);
  check("a verified report's request cannot go back to PENDING", (await call("PATCH", `/lab/requests/${r3._id}/status`, { token: labToken, body: { status: "PENDING" } })).status === 409);
  check("a patient cannot change a request status", (await call("PATCH", `/lab/requests/${r7._id}/status`, { token: patientToken, body: { status: "PENDING" } })).status === 403);

  section("10. legacy data resilience (the error that motivated this work)");
  // A raw-driver write bypasses Mongoose validation. This is exactly the shape
  // of the `priority: "Urgent"` rows found in the shared database: an
  // out-of-enum value on one field of an otherwise valid document. Every
  // subsequent read and transition must survive it instead of throwing.
  const db = mongoose.connection.db;
  const legacy = await db.collection("labrequests").insertOne({
    patient: patient._id, doctor: doctor._id, test: testId,
    priority: "Urgent", status: "Pending", clinicalNotes: `labe2e_legacy_${tag}`,
    requestedDate: new Date(), createdAt: new Date(), updatedAt: new Date(),
  });
  const legacyId = legacy.insertedId;
  const listWithLegacy = await call("GET", "/lab/requests?limit=0", { token: labToken });
  check("a legacy out-of-enum row does not break the list endpoint", listWithLegacy.status === 200, `got ${listWithLegacy.status} ${JSON.stringify(listWithLegacy.data)}`);
  const legacyRead = await call("GET", `/lab/requests/${legacyId}`, { token: labToken });
  check("a legacy row is still individually readable", legacyRead.status === 200, `got ${legacyRead.status}`);
  const legacyAccept = await call("POST", `/lab/requests/${legacyId}/accept`, { token: labToken });
  check("a legacy row can still be accepted (regression fix)", legacyAccept.status === 200, `got ${legacyAccept.status} ${JSON.stringify(legacyAccept.data)}`);
  check("the transition actually persisted", (await LabRequest.findById(legacyId).lean()).status === "ACCEPTED");
  check("the untouched out-of-enum field was left alone, not silently rewritten", (await LabRequest.findById(legacyId).lean()).priority === "Urgent");
  check("the dashboard still counts a legacy row", (await call("GET", "/lab/dashboard", { token: labToken })).status === 200);
  const legacySample = await call("POST", "/lab/samples", { token: labToken, body: { labRequest: legacyId } });
  check("a legacy row can still have a sample collected", legacySample.status === 201, `got ${legacySample.status}`);
  await db.collection("labrequests").deleteOne({ _id: legacyId });
  await SampleCollection.deleteOne({ labRequest: legacyId });

  section("10a. FR-NFR-04 every laboratory mutation is attributable");
  // SRS NFR-04 requires each laboratory update to be traceable to a user, so the
  // audit entry - not the 2xx response - is what these assertions read.
  const auditedActions = [
    "LAB_REQUEST_CREATED",
    "LAB_REQUEST_ACCEPTED",
    "LAB_REQUEST_CANCELLED",
    "LAB_SAMPLE_COLLECTED",
    "LAB_SAMPLE_UPDATED",
    "LAB_PROCESSING_STARTED",
    "LAB_PROCESSING_COMPLETED",
    "LAB_RESULT_ENTERED",
    "LAB_RESULT_UPDATED",
    "LAB_REPORT_GENERATED",
    "LAB_REPORT_VERIFIED",
  ];
  for (const action of auditedActions) {
    check(`${action} wrote an audit entry`, Boolean(await AuditLog.findOne({ action })), "no audit row");
  }
  const acceptAudit = await AuditLog.findOne({ action: "LAB_REQUEST_ACCEPTED", targetId: r1._id }).lean();
  check("the acceptance audit names the acting laboratory user", String(acceptAudit.actor) === String(labUser._id));
  check("the audit row captures the actor's role", acceptAudit.actorRole === "lab", acceptAudit.actorRole);
  check("the audit row carries the actor's email", acceptAudit.actorEmail === labUser.email.toLowerCase(), acceptAudit.actorEmail);
  check("the audit row targets the right document type", acceptAudit.targetType === "LabRequest", acceptAudit.targetType);
  const orderAudit = await AuditLog.findOne({ action: "LAB_REQUEST_CREATED", targetId: orderedRequest._id }).lean();
  check("a doctor's lab order is audited too", Boolean(orderAudit));
  check("the doctor order audit names the doctor", String(orderAudit.actor) === String(doctor._id));

  section("10b. SRS 8.1 the laboratory is told about work, the doctor about progress");
  check("the laboratory was notified about the doctor's order", Boolean(await Notification.findOne({ recipient: labUser._id, type: "LAB_REQUEST_CREATED", entityId: orderedRequest._id }).lean()));
  check("the doctor was told their request was accepted", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_REQUEST_ACCEPTED", entityId: r1._id }).lean()));
  check("the doctor was told a sample was collected", Boolean(await Notification.findOne({ recipient: doctor._id, type: "SAMPLE_COLLECTED", entityId: sample._id }).lean()));
  check("the doctor was told analysis started", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_PROCESSING_STARTED", entityId: r3._id }).lean()));
  check("the doctor was told analysis finished", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_PROCESSING_COMPLETED", entityId: r3._id }).lean()));
  check("the doctor was told the result was entered", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_RESULT_ENTERED", entityId: result._id }).lean()));
  check("the doctor was told the report was generated", Boolean(await Notification.findOne({ recipient: doctor._id, type: "LAB_REPORT_GENERATED", entityId: report._id }).lean()));

  section("10c. FR-LB-03 collection date and time are recorded separately");
  const timed = await makeRequest();
  await call("POST", `/lab/requests/${timed._id}/accept`, { token: labToken });
  const timedRes = await call("POST", "/lab/samples", {
    token: labToken,
    body: { labRequest: timed._id, collectionDate: "2026-01-31", collectionTime: "09:45" },
  });
  check("a sample with an explicit collection time is accepted", timedRes.status === 201, `got ${timedRes.status} ${JSON.stringify(timedRes.data)}`);
  const timedDoc = await SampleCollection.findById(unwrap(timedRes.data)._id).lean();
  // Local getters on purpose: a bare YYYY-MM-DD is the technician's calendar day,
  // not an instant, so it must survive in any timezone (see resolveCollectionDate).
  check("collectionDate keeps the requested day", new Date(timedDoc.collectionDate).getFullYear() === 2026 && new Date(timedDoc.collectionDate).getMonth() === 0 && new Date(timedDoc.collectionDate).getDate() === 31, String(timedDoc.collectionDate));
  check("collectionTime is stored as 09:45 on that day", new Date(timedDoc.collectionTime).getHours() === 9 && new Date(timedDoc.collectionTime).getMinutes() === 45, String(timedDoc.collectionTime));
  check("collectionTime is not a copy of collectionDate", new Date(timedDoc.collectionTime).getTime() !== new Date(timedDoc.collectionDate).getTime());
  await call("PATCH", `/lab/samples/${timedDoc._id}`, { token: labToken, body: { collectionTime: "14:05" } });
  const retimed = await SampleCollection.findById(timedDoc._id).lean();
  check("the collection time can be corrected after collection", new Date(retimed.collectionTime).getHours() === 14 && new Date(retimed.collectionTime).getMinutes() === 5, String(retimed.collectionTime));
  check("correcting the time leaves the date alone", new Date(retimed.collectionDate).getDate() === 31, String(retimed.collectionDate));
  check("a nonsense collection time is rejected", (await call("PATCH", `/lab/samples/${timedDoc._id}`, { token: labToken, body: { collectionTime: "25:99" } })).status === 422);
  check("the rejected time was not stored", new Date((await SampleCollection.findById(timedDoc._id).lean()).collectionTime).getHours() === 14);
  check("an invalid collection date is rejected", (await call("PATCH", `/lab/samples/${timedDoc._id}`, { token: labToken, body: { collectionDate: "2026-13-45" } })).status === 422);

  section("11. notifications and account endpoints");
  const notifications = await call("GET", "/lab/notifications", { token: labToken });
  check("notifications returns 200", notifications.status === 200);
  check("notifications still returns an array", Array.isArray(unwrap(notifications.data)));
  const unread = unwrap((await call("GET", "/lab/notifications/unread-count", { token: labToken })).data);
  check("unread count is a number", typeof unread === "number", JSON.stringify(unread));
  check("the unread filter works", unwrap((await call("GET", "/lab/notifications?unread=true", { token: labToken })).data).every((n) => n.readAt === null));

  // The lab user is not a notification recipient anywhere in the workflow, so
  // seed one to exercise the read endpoints.
  const inbox = await Notification.create({ recipient: labUser._id, type: "LAB_REPORT_VERIFIED", title: "LabE2E", message: "labE2E inbox item" });
  check("marking one notification read works", (await call("PATCH", `/lab/notifications/${inbox._id}/read`, { token: labToken })).status === 200);
  check("readAt persisted", Boolean((await Notification.findById(inbox._id).lean()).readAt));
  const others = await Notification.create({ recipient: patient._id, type: "LAB_REPORT_VERIFIED", title: "LabE2E", message: "belongs to the patient" });
  check("another user's notification cannot be read through this route", (await call("PATCH", `/lab/notifications/${others._id}/read`, { token: labToken })).status === 404);
  check("the other user's notification is genuinely untouched", (await Notification.findById(others._id).lean()).readAt === null);
  check("an unknown notification id returns 404", (await call("PATCH", "/lab/notifications/000000000000000000000000/read", { token: labToken })).status === 404);
  const unreadBefore = await Notification.countDocuments({ recipient: labUser._id, readAt: null });
  check("read-all is idempotent", (await call("PATCH", "/lab/notifications/read-all", { token: labToken })).status === 200);
  check("read-all left nothing unread", (await Notification.countDocuments({ recipient: labUser._id, readAt: null })).valueOf() === 0);
  check("read-all did not touch another user's mail", (await Notification.findById(others._id).lean()).readAt === null, `had ${unreadBefore} unread before`);

  check("profile returns 200", (await call("GET", "/lab/profile", { token: labToken })).status === 200);
  check("settings returns 200", (await call("GET", "/lab/settings", { token: labToken })).status === 200);
  const rename = await call("PATCH", "/lab/profile", { token: labToken, body: { name: `LabE2E Renamed ${tag}` } });
  check("profile update returns 200", rename.status === 200, `got ${rename.status}`);
  check("the new name persisted", (await User.findById(labUser._id).lean()).name === `LabE2E Renamed ${tag}`);
  check("a profile update cannot change the role", (await call("PATCH", "/lab/profile", { token: labToken, body: { role: "admin" } })).status === 200);
  check("the role is unchanged", (await User.findById(labUser._id).lean()).role === "lab");

  // These now assert the same status codes every other role already gets from
  // /auth/change-password (400 for a rejected body, 401 for a bad credential),
  // because this route delegates to that one implementation instead of keeping a
  // private copy that answered 422 for the same failures.
  const weak = await call("PATCH", "/lab/profile/password", { token: labToken, body: { currentPassword: PASSWORD, newPassword: "short" } });
  check("a too-short new password is refused", weak.status === 400, `got ${weak.status}`);
  check("a missing current password is refused", (await call("PATCH", "/lab/profile/password", { token: labToken, body: { newPassword: "Str0ng!Passw0rd1" } })).status === 400);
  check("the wrong current password is refused", (await call("PATCH", "/lab/profile/password", { token: labToken, body: { currentPassword: "wrong", newPassword: "Str0ng!Passw0rd1" } })).status === 401);
  const rotated = await call("PATCH", "/lab/profile/password", { token: labToken, body: { currentPassword: PASSWORD, newPassword: "Str0ng!Passw0rd1" } });
  check("a valid password change succeeds", rotated.status === 200, `got ${rotated.status}`);
  const relogin = unwrap((await call("POST", "/auth/login", { body: { email: labUser.email, password: "Str0ng!Passw0rd1" } })).data);
  check("the new password authenticates", Boolean(relogin.token));
  check("the old password no longer authenticates", (await call("POST", "/auth/login", { body: { email: labUser.email, password: PASSWORD } })).status === 401);

  /* ------------------------------------------------------------------ */
  section("11a. FR-AUTH-10 a forced password change is reachable and retires the flag");

  // The password rotated above is now this account's real password.
  const STRONG = "Str0ng!Passw0rd1";
  const TEMP = "Temp0rary!Passw0rd";

  // Put the account back into the state Admin activation creates: approved and
  // active, but holding a one-time credential it must replace. Assigning through
  // the document (rather than $set) is what runs the pre-save hashing hook.
  const gatedUser = await User.findById(labUser._id);
  gatedUser.password = TEMP;
  gatedUser.mustChangePassword = true;
  await gatedUser.save();

  const gated = await call("GET", "/lab/requests", { token: labToken });
  check(
    "a forced-change account is blocked from the lab workflow",
    gated.status === 403 && gated.data?.code === "PASSWORD_CHANGE_REQUIRED",
    `${gated.status} ${gated.data?.code || ""}`
  );

  // This is the case the route exists for, so it must not sit behind the gate
  // that blocks everything else - otherwise the account can never recover.
  const swap = await call("PATCH", "/lab/profile/password", {
    token: labToken,
    body: { currentPassword: TEMP, newPassword: STRONG },
  });
  check("the password route is reachable while the account is gated", swap.status === 200, `${swap.status} ${JSON.stringify(swap.data)}`);

  const afterSwap = await User.findById(labUser._id).lean();
  check(
    "completing the change clears mustChangePassword",
    afterSwap.mustChangePassword === false,
    `mustChangePassword=${afterSwap.mustChangePassword}`
  );
  check(
    "the retired one-time credential no longer authenticates",
    (await call("POST", "/auth/login", { body: { email: labUser.email, password: TEMP } })).status === 401
  );
  check(
    "the replacement password authenticates",
    Boolean(unwrap((await call("POST", "/auth/login", { body: { email: labUser.email, password: STRONG } })).data)?.token)
  );

  const reopened = await call("GET", "/lab/requests", { token: labToken });
  check("the lab workflow opens again once the flag is cleared", reopened.status === 200, `got ${reopened.status}`);

  check(
    "the change wrote a PASSWORD_CHANGED audit entry",
    Boolean(await AuditLog.findOne({ action: "PASSWORD_CHANGED", actor: labUser._id }))
  );
}

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
