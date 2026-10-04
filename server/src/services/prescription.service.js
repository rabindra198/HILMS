const Prescription = require("../models/Prescription");
const Consultation = require("../models/Consultation");
const User = require("../models/User");
const auditService = require("./audit.service");
const careTeamService = require("./careTeam.service");
const notificationService = require("./notification.service");
const consultationService = require("./consultation.service");
const appointmentService = require("./appointment.service");
const { nextSequence, highestExistingSequence, withDuplicateRetry } = require("../utils/sequence");

/**
 * Prescriptions (FR-DR-03) and the printable/PDF artefact (FR-DR-04).
 *
 * FR-DR-04 is delivered as a print stylesheet on the frontend plus this service
 * returning a fully-denormalised document payload. The payload is the contract:
 * whatever renders the prescription - the doctor's screen today, a PDF library
 * tomorrow - reads the same `document` object, so the printed output cannot
 * drift from what the doctor saw on screen.
 *
 * No Medicine collection is introduced: HILMS has no pharmacy catalogue and the
 * SRS never asks for one. `medicine` is free text.
 */

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const { PATIENT_FIELDS, DOCTOR_FIELDS } = appointmentService;

const nextPrescriptionNo = () => {
  const year = new Date().getFullYear();
  return nextSequence(`prescriptionNo:${year}`, () =>
    highestExistingSequence(Prescription, "prescriptionNo", `RX-${year}-`)
  ).then((seq) => `RX-${year}-${String(seq).padStart(4, "0")}`);
};

/** Validates and normalises one medicine line. */
const normalizeItem = (raw, index) => {
  if (!raw || typeof raw !== "object") {
    fail(`Medicine #${index + 1} is not valid`, 422);
  }

  const medicine = String(raw.medicine || "").trim();
  const dosage = String(raw.dosage || "").trim();
  const duration = String(raw.duration || "").trim();

  if (!medicine) fail(`Medicine #${index + 1}: medicine name is required`, 422);
  if (!dosage) fail(`Medicine #${index + 1}: dosage is required`, 422);
  if (!duration) fail(`Medicine #${index + 1}: duration is required`, 422);

  const frequency = String(raw.frequency || "ONCE_DAILY").toUpperCase();
  if (!Prescription.FREQUENCIES.includes(frequency)) {
    fail(
      `Medicine #${index + 1}: frequency must be one of ${Prescription.FREQUENCIES.join(", ")}`,
      422
    );
  }

  const route = String(raw.route || "ORAL").toUpperCase();
  if (!Prescription.ROUTES.includes(route)) {
    fail(`Medicine #${index + 1}: route must be one of ${Prescription.ROUTES.join(", ")}`, 422);
  }

  const item = {
    medicine,
    dosage,
    frequency,
    duration,
    route,
  };

  if (raw.instructions) item.instructions = String(raw.instructions).trim().slice(0, 500);

  if (raw.quantity !== undefined && raw.quantity !== null && raw.quantity !== "") {
    const quantity = Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      fail(`Medicine #${index + 1}: quantity must be a positive number`, 422);
    }
    item.quantity = quantity;
  }

  return item;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    fail("A prescription must contain at least one medicine", 422);
  }
  if (items.length > 20) {
    fail("A prescription cannot contain more than 20 medicines", 422);
  }
  return items.map(normalizeItem);
};

/**
 * Issues a prescription (FR-DR-03). Optionally links it to a consultation, which
 * is what puts it on the patient's permanent history.
 */
const create = async (payload, doctorId, actor) => {
  const { patient, consultation, followUpDate, notes } = payload;

  const { patient: patientDoc } = await careTeamService.assertAccess(doctorId, patient);

  const items = normalizeItems(payload.items);

  let consultationDoc = null;
  if (consultation) {
    consultationDoc = await Consultation.findOne({
      _id: consultation,
      doctor: doctorId,
      patient: patientDoc._id,
    }).select("_id consultationNo status");
    if (!consultationDoc) fail("Consultation not found", 404);
  }

  let followUp = null;
  if (followUpDate) {
    followUp = new Date(followUpDate);
    if (Number.isNaN(followUp.getTime())) fail("Follow-up date is not valid", 422);
  }

  const prescription = await withDuplicateRetry(async () =>
    Prescription.create({
      prescriptionNo: await nextPrescriptionNo(),
      patient: patientDoc._id,
      doctor: doctorId,
      consultation: consultationDoc?._id,
      items,
      notes,
      followUpDate: followUp,
      status: "ISSUED",
      issuedAt: new Date(),
    })
  );

  if (consultationDoc) {
    await consultationService.attachPrescription(consultationDoc._id, prescription._id);
  }

  await auditService.record({
    action: "PRESCRIPTION_CREATED",
    actor: actor || { _id: doctorId },
    targetType: "Prescription",
    targetId: prescription._id,
    targetEmail: patientDoc.email,
    metadata: {
      prescriptionNo: prescription.prescriptionNo,
      itemCount: items.length,
      consultationNo: consultationDoc?.consultationNo || null,
    },
  });

  // FR-DR-03/04: the patient has to know a prescription was issued for them, and a
  // DRAFT is explicitly not that yet. Best-effort, matching the appointment path.
  if (prescription.status !== "DRAFT") {
    notificationService
      .notifyUser({
        recipient: patientDoc._id,
        type: "PRESCRIPTION_ISSUED",
        title: "Prescription issued",
        message: `Prescription ${prescription.prescriptionNo} with ${items.length} medicine(s) has been issued.`,
        entityType: "Prescription",
        entityId: prescription._id,
      })
      .catch(() => {});
  }

  return prescription.populate([
    { path: "patient", select: PATIENT_FIELDS },
    { path: "doctor", select: DOCTOR_FIELDS },
  ]);
};

const list = async (doctorId, query = {}) => {
  const filter = { doctor: doctorId };

  if (query.patient) {
    await careTeamService.assertAccess(doctorId, query.patient);
    filter.patient = query.patient;
  } else {
    const patientIds = await careTeamService.assignedPatientIds(doctorId);
    if (!patientIds.length) return { items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } };
    filter.patient = { $in: patientIds };
  }

  if (query.status) filter.status = String(query.status).toUpperCase();

  if (query.search) {
    // The Prescription screen has always had a search box ("by prescription number
    // or medicine"), but this was never applied - typing filtered nothing. Same
    // care-team ceiling as the other doctor lists, and the same regex escaping:
    // an unescaped pattern from a search box is a ReDoS and an enumeration vector.
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(safe, "i");
    const patientIds = filter.patient?.$in || [filter.patient].filter(Boolean);

    const matchedPatients = await User.find({
      _id: { $in: patientIds },
      $or: [{ name: regex }, { email: regex }, { phone: regex }, { contactNumber: regex }],
    })
      .select("_id")
      .lean();

    filter.$or = [
      { prescriptionNo: regex },
      { notes: regex },
      { patient: { $in: matchedPatients.map((row) => row._id) } },
      { "items.medicine": regex },
    ];
  }

  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const [items, total] = await Promise.all([
    Prescription.find(filter)
      .populate("patient", PATIENT_FIELDS)
      .populate("consultation", "consultationNo diagnosis")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Prescription.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const getOne = async (doctorId, prescriptionId) => {
  const prescription = await Prescription.findOne({ _id: prescriptionId, doctor: doctorId })
    .populate("patient", PATIENT_FIELDS)
    .populate("doctor", DOCTOR_FIELDS)
    .populate("consultation", "consultationNo diagnosis completedAt")
    .lean();

  if (!prescription) fail("Prescription not found", 404);
  await careTeamService.assertAccess(doctorId, prescription.patient._id);
  return prescription;
};

/**
 * FR-DR-04: the printable document.
 *
 * Denormalised on purpose. The print view and any future PDF renderer must show
 * exactly the same values, so age/gender are resolved here from the patient
 * record rather than left for each renderer to derive differently.
 *
 * This is the PURE half of the document builder: it performs no access control
 * and assumes its caller has already authorised the read. It is shared with the
 * patient module so a patient receives byte-identical output from
 * `utils/prescriptionPdf.js` - the same prescription is never re-rendered into a
 * second, patient-specific document.
 *
 * `prescription` must already have `patient`, `doctor` and `consultation`
 * populated, and `patient` must carry the demographics (dateOfBirth, gender,
 * bloodGroup) that `PATIENT_FIELDS` omits.
 */
const buildDocumentForPrescription = (prescription) => {
  const { calculateAge } = require("../utils/clinical");
  const patient = prescription.patient || {};
  const doctor = prescription.doctor || {};

  return {
    // The document must be able to name its own prescription: both the Doctor and
    // the Patient sheet build a "Download PDF" link from this payload, and without
    // an id here that link resolves to `/prescriptions/undefined/document.pdf`.
    prescriptionId: String(prescription._id),
    prescriptionNo: prescription.prescriptionNo,
    issuedAt: prescription.issuedAt,
    followUpDate: prescription.followUpDate || null,
    status: prescription.status,
    notes: prescription.notes || null,
    patient: {
      id: patient._id,
      name: patient.name,
      email: patient.email,
      contactNumber: patient.contactNumber || patient.phone || null,
      // The public document carries a reference, never the raw ObjectId.
      reference: `PT-${String(patient._id).slice(-6).toUpperCase()}`,
      age: patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : null,
      gender: patient.gender || null,
      bloodGroup: patient.bloodGroup || null,
    },
    doctor: {
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      nmcNumber: doctor.nmcNumber || null,
      department: doctor.department || "General Medicine",
      qualification: doctor.qualification || null,
    },
    items: (prescription.items || []).map((item) => ({
      id: item._id,
      medicine: item.medicine,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions || null,
      route: item.route,
      quantity: item.quantity ?? null,
    })),
    totalQuantity: (prescription.items || []).reduce(
      (sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0),
      0
    ),
    consultation: prescription.consultation
      ? {
          consultationNo: prescription.consultation.consultationNo,
          diagnosis: prescription.consultation.diagnosis || null,
        }
      : null,
  };
};

/** Doctor-scoped entry point: authorise, then build the shared document. */
const buildDocument = async (doctorId, prescriptionId) => {
  const prescription = await getOne(doctorId, prescriptionId);

  // `getOne` populates the shared PATIENT_FIELDS, which deliberately omits the
  // demographics. The printed page must show age, gender and blood group, so the
  // patient is re-read here through the same access check `getOne` just made.
  const { patient: patientRecord } = await careTeamService.assertAccess(
    doctorId,
    prescription.patient._id
  );
  return buildDocumentForPrescription({
    ...prescription,
    patient: { ...prescription.patient, ...patientRecord },
  });
};

module.exports = {
  create,
  list,
  getOne,
  buildDocument,
  buildDocumentForPrescription,
  normalizeItem,
  normalizeItems,
  nextPrescriptionNo,
};
