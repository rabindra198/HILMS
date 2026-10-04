/**
 * Doctor module demo seed (FR-DR-01 .. FR-DR-09).
 *
 * Creates ONE interconnected clinical case rather than a pile of unrelated rows,
 * because the thing worth proving is that the module is genuinely wired
 * together: a consultation references an appointment, its prescription and lab
 * requests reference the consultation, a follow-up references the consultation,
 * and a verified lab report can be compared against an earlier one.
 *
 * Everything is idempotent - re-running updates the same documents instead of
 * duplicating the case.
 *
 * Usage:
 *   npm run seed:doctor
 *
 * Optional overrides:
 *   SEED_DOCTOR_EMAIL / SEED_DOCTOR_PASSWORD / SEED_DOCTOR_NAME
 *   SEED_PATIENT_EMAIL / SEED_PATIENT_PASSWORD / SEED_PATIENT_NAME
 *   SEED_RESET_PASSWORD=true   to re-apply the known dev passwords
 *
 * The fallback passwords are a development convenience only. The script refuses
 * to run with them when NODE_ENV=production.
 */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

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

const pick = (...names) => names.map((n) => process.env[n]).find((v) => v !== undefined && v !== "");

const DOCTOR = {
  name: pick("SEED_DOCTOR_NAME") || "Dr. Anita Gurung",
  email: (pick("SEED_DOCTOR_EMAIL") || "dr.anita.gurung@hilms.com").toLowerCase(),
  password: pick("SEED_DOCTOR_PASSWORD") || "Doctor@123",
  passwordFromEnv: Boolean(pick("SEED_DOCTOR_PASSWORD")),
  nmcNumber: "NMC-48210",
  department: "General Medicine",
  qualification: "MBBS, MD (Internal Medicine)",
  specialization: "Internal Medicine",
};

const PATIENT = {
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

const assertSafeProductionRun = () => {
  if (process.env.NODE_ENV !== "production") return;
  const unsafe = [
    !DOCTOR.passwordFromEnv ? "SEED_DOCTOR_PASSWORD" : null,
    !PATIENT.passwordFromEnv ? "SEED_PATIENT_PASSWORD" : null,
  ].filter(Boolean);
  if (unsafe.length === 0) return;

  console.error(
    "[seed:doctor] Refusing to run in production with the fallback dev passwords.\n" +
      "                 Set these first:\n" +
      unsafe.map((name) => `                   ${name}`).join("\n")
  );
  process.exit(1);
};

/** Upserts a user, keeping the password stable unless explicitly told to reset. */
const upsertUser = async ({ role, ...rest }) => {
  const existing = await User.findOne({ email: rest.email });
  const resetPassword = process.env.SEED_RESET_PASSWORD === "true";

  if (existing) {
    Object.entries(rest).forEach(([key, value]) => {
      if (key === "password" && !resetPassword) return;
      existing[key] = value;
    });
    existing.role = role;
    existing.status = "APPROVED";
    existing.isActive = true;
    // The seed owns a working password, so the doctor is not stuck behind the
    // forced-password-change screen on every fresh run.
    existing.mustChangePassword = false;
    await existing.save();
    return { doc: existing, created: false, passwordReset: resetPassword };
  }

  const doc = await User.create({ ...rest, role, status: "APPROVED", isActive: true, mustChangePassword: false });
  return { doc, created: true, passwordReset: false };
};

/** Ensures the CBC test exists so the lab leg of the case has something to run. */
const ensureTest = async () => {
  const testCode = "CBC";
  const existing = await LabTest.findOne({ testCode });
  if (existing) return existing;
  return LabTest.create({
    testCode,
    name: "Complete Blood Count",
    category: "Haematology",
    sampleType: "blood",
    price: 800,
    // `referenceRanges` is an array of strings on this schema, one per test.
    referenceRanges: ["Haemoglobin 13.0-17.0 g/dL", "White Cell Count 4000-11000 cells/mm3"],
    normalRange: "Haemoglobin 13.0-17.0 g/dL",
    unit: "g/dL",
    turnaroundTime: 4,
    isActive: true,
  });
};

const run = async () => {
  assertSafeProductionRun();
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    console.error("Could not connect to MongoDB. Check MONGO_URI in server/.env.");
    process.exit(1);
  }

  console.log(`database: ${mongoose.connection.name}\n`);

  // ---- Accounts -------------------------------------------------------
  const doctorResult = await upsertUser({ role: "doctor", ...DOCTOR });
  const patientResult = await upsertUser({ role: "patient", ...PATIENT });
  const doctor = doctorResult.doc;
  const patient = patientResult.doc;

  console.log("accounts");
  console.log(`  doctor   ${doctor.email}  (${doctorResult.created ? "created" : "updated"})`);
  console.log(`  patient  ${patient.email}  (${patientResult.created ? "created" : "updated"})`);

  // ---- Care team ------------------------------------------------------
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
  console.log("\ncare team");
  console.log("  patient assigned to doctor");

  // ---- Past consultation (the root of the history chain) --------------
  const test = await ensureTest();

  const consultationNo = "CON-2026-0001";
  const consultation = await Consultation.findOneAndUpdate(
    { consultationNo },
    {
      $set: {
        consultationNo,
        patient: patient._id,
        doctor: doctor._id,
        chiefComplaint: "Intermittent fever and fatigue for two weeks",
        symptoms: "Low-grade fever, body ache, loss of appetite",
        diagnosis: "Iron deficiency anaemia with concurrent infection",
        clinicalNotes:
          "Reports fatigue on exertion. No chest pain, no bleeding history. Advised iron therapy and repeat CBC in four weeks.",
        treatmentPlan: "Oral ferrous sulphate 325mg once daily. Investigate and treat underlying infection.",
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
  console.log("\nclinical record");
  console.log(`  consultation ${consultation.consultationNo} (completed)`);

  // ---- Prescription issued from that consultation ---------------------
  const prescriptionNo = "RX-2026-0001";
  const prescription = await Prescription.findOneAndUpdate(
    { prescriptionNo },
    {
      $set: {
        prescriptionNo,
        patient: patient._id,
        doctor: doctor._id,
        consultation: consultation._id,
        items: [
          {
            medicine: "Ferrous Sulphate 325mg",
            dosage: "325 mg",
            frequency: "ONCE_DAILY",
            duration: "3 months",
            route: "ORAL",
            quantity: 90,
            instructions: "Take with vitamin C, on an empty stomach if tolerated.",
          },
          {
            medicine: "Folic Acid 5mg",
            dosage: "5 mg",
            frequency: "ONCE_DAILY",
            duration: "3 months",
            route: "ORAL",
            quantity: 90,
          },
        ],
        notes: "Expect dark stools. Return immediately if you develop severe abdominal pain.",
        status: "ISSUED",
        issuedAt: new Date("2026-08-10T10:40:00Z"),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Consultation.updateOne(
    { _id: consultation._id },
    { $addToSet: { prescriptions: prescription._id } }
  );
  console.log(`  prescription ${prescription.prescriptionNo} (${prescription.items.length} medicines)`);

  // ---- Two lab rounds so FR-DR-07 comparison has something to compare ---
  // The lab pipeline is request -> sample -> result -> report, and both
  // `labRequest` and `requestedDate` are deterministic here so a re-run updates
  // the same documents instead of adding a third round.
  const buildLabRound = async ({ round, requestedOffsetDays, generatedOffsetDays, haemoglobin }) => {
    const requestedDate = new Date(Date.UTC(2026, 7, 10 + requestedOffsetDays, 4, 30));
    const generatedAt = new Date(Date.UTC(2026, 7, 10 + generatedOffsetDays, 6, 15));

    const labRequest = await LabRequest.findOneAndUpdate(
      { patient: patient._id, test: test._id, doctor: doctor._id, requestedDate },
      {
        $set: {
          patient: patient._id,
          test: test._id,
          doctor: doctor._id,
          consultation: consultation._id,
          priority: "ROUTINE",
          clinicalNotes: `CBC round ${round} for anaemia workup`,
          status: "COMPLETED",
          sampleStatus: "COLLECTED",
          requestedDate,
          acceptedAt: new Date(requestedDate.getTime() + 15 * 60000),
          acceptedBy: doctor._id,
          processingStartedAt: new Date(requestedDate.getTime() + 60 * 60000),
          processingCompletedAt: generatedAt,
          processedBy: doctor._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const sample = await SampleCollection.findOneAndUpdate(
      { sampleId: `SMP-${round}-${String(patient._id).slice(-4).toUpperCase()}` },
      {
        $set: {
          sampleId: `SMP-${round}-${String(patient._id).slice(-4).toUpperCase()}`,
          labRequest: labRequest._id,
          patient: patient._id,
          test: test._id,
          sampleType: "blood",
          collectionDate: new Date(requestedDate.getTime() + 30 * 60000),
          collectionTime: new Date(requestedDate.getTime() + 30 * 60000),
          collectedBy: doctor._id,
          status: "RECEIVED",
          notes: "Adequate sample, no haemolysis.",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const result = await LabResult.findOneAndUpdate(
      { labRequest: labRequest._id, patient: patient._id, test: test._id },
      {
        $set: {
          labRequest: labRequest._id,
          sample: sample._id,
          patient: patient._id,
          test: test._id,
          enteredBy: doctor._id,
          parameters: [
            {
              parameter: "Haemoglobin",
              value: haemoglobin,
              unit: "g/dL",
              referenceRange: "13.0-17.0",
              flag: haemoglobin < 13 ? "LOW" : "NORMAL",
            },
            {
              parameter: "White Cell Count",
              value: 8200,
              unit: "cells/mm3",
              referenceRange: "4000-11000",
              flag: "NORMAL",
            },
            {
              parameter: "Platelet Count",
              value: 245000,
              unit: "cells/mm3",
              referenceRange: "150000-410000",
              flag: "NORMAL",
            },
          ],
          enteredAt: generatedAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const reportId = `LR-${round}-${String(patient._id).slice(-4).toUpperCase()}`;
    const report = await LabReport.findOneAndUpdate(
      { reportId },
      {
        $set: {
          reportId,
          labRequest: labRequest._id,
          patient: patient._id,
          doctor: doctor._id,
          test: test._id,
          sample: sample._id,
          results: [result._id],
          generatedBy: doctor._id,
          generatedAt,
          verifiedAt: new Date(generatedAt.getTime() + 30 * 60000),
          status: "VERIFIED",
          remarks:
            round === 1 ? "Mild normocytic anaemia." : "Haemoglobin improved on iron therapy.",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { labRequest, sample, result, report, generatedAt };
  };

  const first = await buildLabRound({ round: 1, requestedOffsetDays: 0, generatedOffsetDays: 1, haemoglobin: 10.8 });
  const second = await buildLabRound({ round: 2, requestedOffsetDays: 28, generatedOffsetDays: 29, haemoglobin: 11.9 });

  console.log(`  lab report ${first.report.reportId} (baseline, verified)`);
  console.log(`  lab report ${second.report.reportId} (repeat, verified)`);

  // Leave the repeat report un-reviewed so the dashboard's "pending reports"
  // tile and the review screen both have something real to show.
  await LabReport.updateOne(
    { _id: second.report._id },
    { $set: { doctorComments: [] } }
  );
  await LabReport.updateOne(
    { _id: first.report._id },
    {
      $set: {
        doctorComments: [
          {
            comment:
              "Haemoglobin remains below range. Continue current therapy and review ferritin before escalating.",
            interpretation: "Partial response to iron therapy.",
            treatmentDecision: "Continue ferrous sulphate; add ferritin assay.",
            doctor: doctor._id,
            commentedAt: new Date(Date.UTC(2026, 7, 12, 9, 0)),
          },
        ],
      },
    }
  );
  console.log("  baseline report reviewed; repeat report left pending review");

  // ---- Today's appointment + its follow-up -----------------------------
  const today = new Date();
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const appointmentNo = "APT-2026-0001";
  const appointment = await Appointment.findOneAndUpdate(
    { appointmentNo },
    {
      $set: {
        appointmentNo,
        patient: patient._id,
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
  console.log(`\nschedule`);
  console.log(`  ${appointmentNo} today 10:00 FOLLOW_UP (confirmed)`);

  // ---- Summary ---------------------------------------------------------
  const counts = await Promise.all([
    Appointment.countDocuments({ doctor: doctor._id }),
    Consultation.countDocuments({ doctor: doctor._id }),
    Prescription.countDocuments({ doctor: doctor._id }),
    LabRequest.countDocuments({ doctor: doctor._id }),
    LabReport.countDocuments({ doctor: doctor._id }),
    DoctorPatientAssignment.countDocuments({ doctor: doctor._id, revokedAt: null }),
  ]);

  console.log("\nseeded totals for this doctor");
  console.log(`  appointments           ${counts[0]}`);
  console.log(`  consultations          ${counts[1]}`);
  console.log(`  prescriptions          ${counts[2]}`);
  console.log(`  laboratory requests    ${counts[3]}`);
  console.log(`  laboratory reports     ${counts[4]}`);
  console.log(`  care team members      ${counts[5]}`);

  console.log("\nsign in as the doctor:");
  console.log(`  ${DOCTOR.email} / ${DOCTOR.passwordFromEnv ? "<your SEED_DOCTOR_PASSWORD>" : DOCTOR.password}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(`seed:doctor failed: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
