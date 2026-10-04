/**
 * End-to-end demo seed (accounts + one connected clinical workflow).
 *
 * Unlike `seed.js` (Admin only), `seed-lab.js` (catalogue/requests) and
 * `seed-doctor.js` (a doctor's clinical case), this script provisions the whole
 * cast and the whole chain in one idempotent run so the system can be demoed
 * without hand-creating anything:
 *
 *   Admin, Laboratory, Doctor + two Patients
 *      -> appointment -> consultation -> prescription
 *      -> laboratory request -> sample -> result -> report (verified)
 *      -> invoice -> payment
 *
 * Every document is written through the Mongoose models (no `insertMany`), so a
 * row this script can write is a row the API would accept. Re-running updates the
 * same documents instead of duplicating them.
 *
 * Usage:
 *   npm run seed:demo                 # write the demo dataset
 *   node src/scripts/seed-demo.js --db=hilms_demo   # isolate to a scratch DB
 *
 * Optional overrides:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *   SEED_LAB_EMAIL / SEED_LAB_PASSWORD
 *   SEED_DOCTOR_EMAIL / SEED_DOCTOR_PASSWORD
 *   SEED_PATIENT_EMAIL / SEED_PATIENT_PASSWORD       (first patient)
 *   SEED_PATIENT2_EMAIL / SEED_PATIENT2_PASSWORD     (second patient)
 *   SEED_RESET_PASSWORD=true    re-apply the known dev passwords
 *
 * The fallback passwords are a development convenience only. The script refuses
 * to run with them when NODE_ENV=production.
 */
require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const env = require("../config/env");
const User = require("../models/User");
const LabTest = require("../models/LabTest");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");
const LabRequest = require("../models/LabRequest");
const LabReport = require("../models/LabReport");
const LabResult = require("../models/LabResult");
const SampleCollection = require("../models/SampleCollection");
const DoctorPatientAssignment = require("../models/DoctorPatientAssignment");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");

const DB_NAME = (process.argv.find((arg) => arg.startsWith("--db=")) || "").split("=")[1];
const RESET_PASSWORD = process.env.SEED_RESET_PASSWORD === "true";
const pick = (...names) => names.map((n) => process.env[n]).find((v) => v !== undefined && v !== "");

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const ADMIN = {
  name: pick("SEED_ADMIN_NAME") || "HILMS Admin",
  email: (pick("SEED_ADMIN_EMAIL", "ADMIN_EMAIL") || "admin@hilms.com").toLowerCase(),
  password: pick("SEED_ADMIN_PASSWORD", "ADMIN_PASSWORD") || "Admin@123",
  passwordFromEnv: Boolean(pick("SEED_ADMIN_PASSWORD", "ADMIN_PASSWORD")),
};

const LAB = {
  name: pick("SEED_LAB_NAME") || "Rita Sharma",
  email: (pick("SEED_LAB_EMAIL") || "lab.technologist@hilms.com").toLowerCase(),
  password: pick("SEED_LAB_PASSWORD") || "Lab@12345",
  passwordFromEnv: Boolean(pick("SEED_LAB_PASSWORD")),
  labRegistryNumber: "LAB-REG-2026-001",
};

const DOCTOR = {
  name: pick("SEED_DOCTOR_NAME") || "Dr. Anita Gurung",
  email: (pick("SEED_DOCTOR_EMAIL") || "dr.anita.gurung@hilms.com").toLowerCase(),
  password: pick("SEED_DOCTOR_PASSWORD") || "Doctor@123",
  passwordFromEnv: Boolean(pick("SEED_DOCTOR_PASSWORD")),
  nmcNumber: "NMC-48210",
  department: "General Medicine",
  qualification: "MBBS, MD (Internal Medicine)",
  specialization: "Internal Medicine",
  consultationFee: 500,
};

const PATIENT_ONE = {
  name: pick("SEED_PATIENT_NAME") || "Bikash Thapa",
  email: (pick("SEED_PATIENT_EMAIL") || "bikash.thapa@hilms.com").toLowerCase(),
  password: pick("SEED_PATIENT_PASSWORD") || "Patient@123",
  passwordFromEnv: Boolean(pick("SEED_PATIENT_PASSWORD")),
  phone: "+9779800000001",
  contactNumber: "+9779800000001",
  address: "Koteshwor, Kathmandu",
  dateOfBirth: new Date("1988-03-14"),
  gender: "male",
  bloodGroup: "O+",
  allergies: "Penicillin - rash",
  emergencyContactName: "Sita Thapa",
  emergencyContactNumber: "+9779800000002",
};

const PATIENT_TWO = {
  name: pick("SEED_PATIENT2_NAME") || "Sunita Rai",
  email: (pick("SEED_PATIENT2_EMAIL") || "sunita.rai@hilms.com").toLowerCase(),
  password: pick("SEED_PATIENT2_PASSWORD") || "Patient@123",
  passwordFromEnv: Boolean(pick("SEED_PATIENT2_PASSWORD")),
  phone: "+9779800000011",
  contactNumber: "+9779800000011",
  address: "Patan, Lalitpur",
  dateOfBirth: new Date("1994-11-02"),
  gender: "female",
  bloodGroup: "B+",
  emergencyContactName: "Hari Rai",
  emergencyContactNumber: "+9779800000012",
};

const assertSafeProductionRun = () => {
  if (process.env.NODE_ENV !== "production") return;
  const unsafe = [
    !ADMIN.passwordFromEnv ? "SEED_ADMIN_PASSWORD" : null,
    !LAB.passwordFromEnv ? "SEED_LAB_PASSWORD" : null,
    !DOCTOR.passwordFromEnv ? "SEED_DOCTOR_PASSWORD" : null,
    !PATIENT_ONE.passwordFromEnv ? "SEED_PATIENT_PASSWORD" : null,
    !PATIENT_TWO.passwordFromEnv ? "SEED_PATIENT2_PASSWORD" : null,
  ].filter(Boolean);
  if (unsafe.length === 0) return;

  console.error(
    "[seed:demo] Refusing to run in production with the fallback dev passwords.\n" +
      "            Set these first:\n" +
      unsafe.map((name) => `              ${name}`).join("\n")
  );
  process.exit(1);
};

/**
 * Upserts a user by email, keeping the stored password unless a reset was asked
 * for. An explicit dev password is applied when the row is first created.
 */
const upsertUser = async ({ role, ...rest }) => {
  const existing = await User.findOne({ email: rest.email }).select("+password");

  if (existing) {
    const { password, ...profile } = rest;
    Object.assign(existing, profile);
    existing.role = role;
    existing.status = "APPROVED";
    existing.isActive = true;
    existing.mustChangePassword = false;
    // `findOne().select("+password")` returns a document whose password is
    // selected; assigning a plaintext only when resetting lets the pre-save hook
    // hash it exactly once. Otherwise leave the stored hash untouched.
    if (RESET_PASSWORD && password && !BCRYPT_HASH_PATTERN.test(password)) {
      existing.password = password;
    }
    await existing.save();
    return { doc: existing, created: false };
  }

  const doc = await User.create({
    ...rest,
    role,
    status: "APPROVED",
    isActive: true,
    mustChangePassword: false,
  });
  return { doc, created: true };
};

/** Ensures the CBC and Fasting Blood Sugar tests exist with a runnable panel. */
const ensureTests = async () => {
  const cbc = await LabTest.findOneAndUpdate(
    { testCode: "CBC" },
    {
      $set: {
        testCode: "CBC",
        name: "Complete Blood Count",
        category: "Haematology",
        sampleType: "blood",
        price: 800,
        unit: "g/dL",
        turnaroundTime: 4,
        isActive: true,
        resultStyle: "PANEL",
        parameters: [
          { parameter: "Haemoglobin", unit: "g/dL", min: 13, max: 17, isRequired: true, isNumeric: true, sortOrder: 0 },
          { parameter: "White Cell Count", unit: "cells/mm3", min: 4000, max: 11000, isRequired: true, isNumeric: true, sortOrder: 1 },
          { parameter: "Platelet Count", unit: "cells/mm3", min: 150000, max: 410000, isRequired: false, isNumeric: true, sortOrder: 2 },
        ],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  const fbs = await LabTest.findOneAndUpdate(
    { testCode: "FBS" },
    {
      $set: {
        testCode: "FBS",
        name: "Fasting Blood Sugar",
        category: "Biochemistry",
        sampleType: "blood",
        price: 400,
        unit: "mmol/L",
        turnaroundTime: 3,
        isActive: true,
        resultStyle: "PANEL",
        parameters: [
          { parameter: "Fasting Blood Sugar", unit: "mmol/L", min: 3.9, max: 5.5, isRequired: true, isNumeric: true, sortOrder: 0 },
        ],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  return { cbc, fbs };
};

const run = async () => {
  assertSafeProductionRun();

  const options = DB_NAME ? { dbName: DB_NAME } : {};
  await mongoose.connect(env.mongoUri, options);
  if (mongoose.connection.readyState !== 1) {
    console.error("Could not connect to MongoDB. Check MONGO_URI in server/.env.");
    process.exit(1);
  }
  console.log(`database: ${mongoose.connection.name}\n`);

  // ---- Accounts -------------------------------------------------------
  const [adminResult, labResult, doctorResult, patientOneResult, patientTwoResult] = await Promise.all([
    upsertUser({ role: "admin", ...ADMIN }),
    upsertUser({ role: "lab", ...LAB }),
    upsertUser({ role: "doctor", ...DOCTOR }),
    upsertUser({ role: "patient", ...PATIENT_ONE }),
    upsertUser({ role: "patient", ...PATIENT_TWO }),
  ]);
  const admin = adminResult.doc;
  const lab = labResult.doc;
  const doctor = doctorResult.doc;
  const patientOne = patientOneResult.doc;
  const patientTwo = patientTwoResult.doc;

  console.log("accounts");
  const line = (label, result, email) => console.log(`  ${label.padEnd(9)} ${email}  (${result.created ? "created" : "updated"})`);
  line("admin", adminResult, admin.email);
  line("lab", labResult, lab.email);
  line("doctor", doctorResult, doctor.email);
  line("patient1", patientOneResult, patientOne.email);
  line("patient2", patientTwoResult, patientTwo.email);

  // ---- Care team ------------------------------------------------------
  for (const patient of [patientOne, patientTwo]) {
    await DoctorPatientAssignment.findOneAndUpdate(
      { doctor: doctor._id, patient: patient._id, revokedAt: null },
      {
        $set: {
          doctor: doctor._id,
          patient: patient._id,
          assignedBy: doctor._id,
          relationship: "Primary physician",
          assignedAt: new Date(),
          revokedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log("\ncare team");
  console.log(`  both patients assigned to ${doctor.name}`);

  // ---- Clinical chain for the first patient ---------------------------
  const { cbc } = await ensureTests();

  const consultationNo = "CON-DEMO-0001";
  const consultation = await Consultation.findOneAndUpdate(
    { consultationNo },
    {
      $set: {
        consultationNo,
        patient: patientOne._id,
        doctor: doctor._id,
        chiefComplaint: "Intermittent fever and fatigue for two weeks",
        symptoms: "Low-grade fever, body ache, loss of appetite",
        diagnosis: "Iron deficiency anaemia with concurrent infection",
        clinicalNotes: "Reports fatigue on exertion. No chest pain or bleeding history. Advised iron therapy and a repeat CBC.",
        treatmentPlan: "Oral ferrous sulphate 325mg once daily. Investigate and treat the underlying infection.",
        treatmentOutcome: "Patient reports improved energy after two weeks of therapy.",
        status: "COMPLETED",
        startedAt: new Date("2026-08-10T10:00:00Z"),
        completedAt: new Date("2026-08-10T10:35:00Z"),
        vitals: {
          bloodPressureSystolic: 118,
          bloodPressureDiastolic: 76,
          heartRate: 78,
          temperature: 37.1,
          respiratoryRate: 16,
          spo2: 98,
          weight: 72,
          height: 174,
          bmi: 23.8,
          notes: "Alert and oriented. No pallor noted.",
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const prescriptionNo = "RX-DEMO-0001";
  const prescription = await Prescription.findOneAndUpdate(
    { prescriptionNo },
    {
      $set: {
        prescriptionNo,
        patient: patientOne._id,
        doctor: doctor._id,
        consultation: consultation._id,
        items: [
          { medicine: "Ferrous Sulphate 325mg", dosage: "325 mg", frequency: "ONCE_DAILY", duration: "3 months", route: "ORAL", quantity: 90, instructions: "Take with vitamin C, on an empty stomach if tolerated." },
          { medicine: "Folic Acid 5mg", dosage: "5 mg", frequency: "ONCE_DAILY", duration: "3 months", route: "ORAL", quantity: 90 },
        ],
        notes: "Expect dark stools. Return immediately if you develop severe abdominal pain.",
        status: "ISSUED",
        issuedAt: new Date("2026-08-10T10:40:00Z"),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Consultation.updateOne({ _id: consultation._id }, { $addToSet: { prescriptions: prescription._id } });

  const requestedDate = new Date("2026-08-10T04:30:00Z");
  const generatedAt = new Date("2026-08-11T06:15:00Z");

  const labRequest = await LabRequest.findOneAndUpdate(
    { clinicalNotes: "DEMO CBC baseline for anaemia workup" },
    {
      $set: {
        patient: patientOne._id,
        test: cbc._id,
        doctor: doctor._id,
        consultation: consultation._id,
        priority: "ROUTINE",
        clinicalNotes: "DEMO CBC baseline for anaemia workup",
        status: "COMPLETED",
        sampleStatus: "COLLECTED",
        requestedDate,
        acceptedAt: new Date(requestedDate.getTime() + 15 * 60000),
        acceptedBy: lab._id,
        processingStartedAt: new Date(requestedDate.getTime() + 60 * 60000),
        processingCompletedAt: generatedAt,
        processedBy: lab._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const sample = await SampleCollection.findOneAndUpdate(
    { sampleId: "SMP-DEMO-0001" },
    {
      $set: {
        sampleId: "SMP-DEMO-0001",
        labRequest: labRequest._id,
        patient: patientOne._id,
        test: cbc._id,
        sampleType: "blood",
        collectionDate: new Date(requestedDate.getTime() + 30 * 60000),
        collectionTime: new Date(requestedDate.getTime() + 30 * 60000),
        collectedBy: lab._id,
        status: "RECEIVED",
        notes: "Adequate sample, no haemolysis.",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const result = await LabResult.findOneAndUpdate(
    { labRequest: labRequest._id, patient: patientOne._id, test: cbc._id },
    {
      $set: {
        labRequest: labRequest._id,
        sample: sample._id,
        patient: patientOne._id,
        test: cbc._id,
        enteredBy: lab._id,
        parameters: [
          { parameter: "Haemoglobin", value: 11.2, unit: "g/dL", referenceRange: "13 - 17 g/dL", flag: "LOW" },
          { parameter: "White Cell Count", value: 7600, unit: "cells/mm3", referenceRange: "4000 - 11000 cells/mm3", flag: "NORMAL" },
          { parameter: "Platelet Count", value: 240000, unit: "cells/mm3", referenceRange: "150000 - 410000 cells/mm3", flag: "NORMAL" },
        ],
        enteredAt: generatedAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const report = await LabReport.findOneAndUpdate(
    { reportId: "LR-DEMO-0001" },
    {
      $set: {
        reportId: "LR-DEMO-0001",
        labRequest: labRequest._id,
        patient: patientOne._id,
        doctor: doctor._id,
        test: cbc._id,
        sample: sample._id,
        results: [result._id],
        generatedBy: lab._id,
        generatedAt,
        verifiedBy: lab._id,
        verifiedAt: new Date(generatedAt.getTime() + 30 * 60000),
        status: "VERIFIED",
        remarks: "Mild normocytic anaemia. Clinical correlation advised.",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("\nclinical record");
  console.log(`  consultation ${consultation.consultationNo} (completed)`);
  console.log(`  prescription ${prescription.prescriptionNo} (${prescription.items.length} medicines, issued)`);
  console.log(`  lab request -> sample ${sample.sampleId} -> result -> report ${report.reportId} (verified)`);

  // ---- Scheduling -----------------------------------------------------
  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const appointmentOne = await Appointment.findOneAndUpdate(
    { appointmentNo: "APT-DEMO-0001" },
    {
      $set: {
        appointmentNo: "APT-DEMO-0001",
        patient: patientOne._id,
        doctor: doctor._id,
        appointmentDate: todayStart,
        startMinutes: 10 * 60,
        durationMinutes: 30,
        type: "FOLLOW_UP",
        status: "CONFIRMED",
        reason: "Review repeat CBC and assess response to iron therapy",
        followUpOf: consultation._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const appointmentTwo = await Appointment.findOneAndUpdate(
    { appointmentNo: "APT-DEMO-0002" },
    {
      $set: {
        appointmentNo: "APT-DEMO-0002",
        patient: patientTwo._id,
        doctor: doctor._id,
        appointmentDate: todayStart,
        startMinutes: 11 * 60 + 30,
        durationMinutes: 30,
        type: "CONSULTATION",
        status: "SCHEDULED",
        reason: "New patient consultation",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("\nschedule");
  console.log(`  ${appointmentOne.appointmentNo} today 10:00 FOLLOW_UP (confirmed)`);
  console.log(`  ${appointmentTwo.appointmentNo} today 11:30 CONSULTATION (scheduled)`);

  // ---- Billing + payment ---------------------------------------------
  // Invoices are saved as documents (not `findOneAndUpdate`) so the schema's
  // `pre("validate")` hook recomputes amounts and status from the line items
  // exactly the way the billing service does.
  const buildInvoice = async ({ invoiceNo, patient, appointment, items, issuedAt, dueDate }) => {
    let invoice = await Invoice.findOne({ invoiceNo });
    if (!invoice) invoice = new Invoice({ invoiceNo });
    invoice.patient = patient._id;
    invoice.appointment = appointment._id;
    invoice.items = items;
    invoice.createdBy = admin._id;
    invoice.issuedAt = issuedAt;
    invoice.dueDate = dueDate;
    invoice.status = "UNPAID";
    invoice.amountPaid = 0;
    await invoice.save();
    return invoice;
  };

  const paidInvoice = await buildInvoice({
    invoiceNo: "INV-DEMO-0001",
    patient: patientOne,
    appointment: appointmentOne,
    issuedAt: new Date("2026-08-11T07:00:00Z"),
    dueDate: new Date("2026-08-25T07:00:00Z"),
    items: [
      { description: "Consultation - Dr. Anita Gurung", itemType: "CONSULTATION", sourceType: "Consultation", sourceId: consultation._id, quantity: 1, unitPrice: doctor.consultationFee, amount: doctor.consultationFee },
      { description: "Complete Blood Count", itemType: "LABORATORY", sourceType: "LabRequest", sourceId: labRequest._id, quantity: 1, unitPrice: cbc.price, amount: cbc.price },
    ],
  });

  let payment = await Payment.findOne({ paymentNo: "PAY-DEMO-0001" });
  if (!payment) {
    payment = await Payment.create({
      paymentNo: "PAY-DEMO-0001",
      invoice: paidInvoice._id,
      patient: patientOne._id,
      amount: paidInvoice.total,
      method: "CASH",
      status: "SUCCESS",
      note: "Settled at the front desk.",
      paidAt: new Date("2026-08-11T07:20:00Z"),
      receivedBy: admin._id,
    });
  }
  paidInvoice.amountPaid = paidInvoice.total;
  await paidInvoice.save();

  const unpaidInvoice = await buildInvoice({
    invoiceNo: "INV-DEMO-0002",
    patient: patientTwo,
    appointment: appointmentTwo,
    issuedAt: new Date(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    items: [
      { description: "Consultation - Dr. Anita Gurung", itemType: "CONSULTATION", sourceType: "Appointment", sourceId: appointmentTwo._id, quantity: 1, unitPrice: doctor.consultationFee, amount: doctor.consultationFee },
    ],
  });

  console.log("\nbilling");
  console.log(`  ${paidInvoice.invoiceNo} total ${paidInvoice.total} -> ${paidInvoice.status} (payment ${payment.paymentNo})`);
  console.log(`  ${unpaidInvoice.invoiceNo} total ${unpaidInvoice.total} -> ${unpaidInvoice.status}`);

  // ---- Summary --------------------------------------------------------
  console.log("\nsign in with any of these (all passwords are dev-only):");
  console.log(`  admin     ${ADMIN.email} / ${ADMIN.passwordFromEnv ? "<SEED_ADMIN_PASSWORD>" : ADMIN.password}`);
  console.log(`  lab       ${LAB.email} / ${LAB.passwordFromEnv ? "<SEED_LAB_PASSWORD>" : LAB.password}`);
  console.log(`  doctor    ${DOCTOR.email} / ${DOCTOR.passwordFromEnv ? "<SEED_DOCTOR_PASSWORD>" : DOCTOR.password}`);
  console.log(`  patient1  ${PATIENT_ONE.email} / ${PATIENT_ONE.passwordFromEnv ? "<SEED_PATIENT_PASSWORD>" : PATIENT_ONE.password}`);
  console.log(`  patient2  ${PATIENT_TWO.email} / ${PATIENT_TWO.passwordFromEnv ? "<SEED_PATIENT2_PASSWORD>" : PATIENT_TWO.password}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(`seed:demo failed: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
