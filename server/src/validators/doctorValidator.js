const { body, param, query } = require("express-validator");
const { isValidObjectId } = require("mongoose");
const { handleValidationErrors } = require("./validationHandler");
const Appointment = require("../models/Appointment");
const Consultation = require("../models/Consultation");
const Prescription = require("../models/Prescription");

/**
 * Input validation for the doctor module.
 *
 * Transport-shape rules live here (is this an id, is this a date, is the field
 * present). Clinical rule checks that need to know what is already in the
 * database - care-team membership, slot clashes, transition legality - live in
 * the services, because a validator cannot see the database.
 */

const objectId = (field, label) =>
  param(field)
    .custom((value) => isValidObjectId(String(value)))
    .withMessage(`${label} is not a valid id`);

const qObjectId = (field, label) =>
  query(field)
    .optional()
    .custom((value) => isValidObjectId(String(value)))
    .withMessage(`${label} is not a valid id`);

const shortText = (max, label) =>
  body(label)
    .optional()
    .trim()
    .isLength({ max })
    .withMessage(`${label} must be ${max} characters or fewer`);

// ---- Params -------------------------------------------------------------

const validateAppointmentId = [objectId("id", "Appointment")];
const validateConsultationId = [objectId("id", "Consultation")];
const validatePrescriptionId = [objectId("id", "Prescription")];
const validatePatientId = [objectId("patientId", "Patient")];
const validateDoctorId = [objectId("doctorId", "Doctor")];
const validateReportId = [objectId("id", "Laboratory report")];

// ---- Appointments (FR-DR-01) -------------------------------------------

const validateListAppointments = [
  query("scope")
    .optional()
    .isIn(["today", "upcoming", "past", "completed", "cancelled", "all"])
    .withMessage("Scope must be today, upcoming, past, completed, cancelled or all"),
  query("status")
    .optional()
    .isIn(Appointment.APPOINTMENT_STATUSES)
    .withMessage("That appointment status is not recognised"),
  query("type")
    .optional()
    .isIn(Appointment.APPOINTMENT_TYPES)
    .withMessage("That appointment type is not recognised"),
  query("date").optional().isISO8601().withMessage("Date must be a valid calendar date"),
  query("search").optional().trim().isLength({ max: 120 }).withMessage("Search text is too long"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or greater"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  qObjectId("patient", "Patient"),
];

const validateBookAppointment = [
  body("patient").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a patient"),
  body("appointmentDate").isISO8601().withMessage("Please choose a valid appointment date"),
  body("startTime")
    .trim()
    .matches(/^([01]?\d|2[0-3]):[0-5]\d$/)
    .withMessage("Start time must look like 09:30"),
  body("durationMinutes")
    .optional()
    .isInt({ min: 5, max: 240 })
    .withMessage("Duration must be between 5 and 240 minutes"),
  body("type")
    .optional()
    .isIn(Appointment.APPOINTMENT_TYPES)
    .withMessage("That appointment type is not recognised"),
  shortText(300, "reason"),
  body("followUpOf")
    .optional({ values: "falsy" })
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("The consultation being followed up is not a valid id"),
  // A follow-up that points at nothing is not a follow-up, and the doctor cannot
  // tell from the form that it failed to save. Caught here rather than left to
  // the service so the message names the field.
  //
  // `custom` coerces the RETURN VALUE to a boolean, so returning the message
  // string would mean "valid" and the check would silently never fire. It has to
  // return `false` and let `withMessage` supply the wording.
  body("type")
    .custom((value, { req }) => {
      if (String(value || "").toUpperCase() !== "FOLLOW_UP") return true;
      return Boolean(req.body && req.body.followUpOf);
    })
    .withMessage("A follow-up appointment must reference the consultation it follows"),
];

const validateUpdateAppointmentStatus = [
  body("status")
    .isIn(Appointment.APPOINTMENT_STATUSES)
    .withMessage("That appointment status is not recognised"),
];

// ---- Consultations (FR-DR-02, FR-DR-08) --------------------------------

/**
 * Field limits are mirrored from the Consultation schema, deliberately kept at
 * or below it. If a validator were looser than the model, an over-long value
 * would pass validation and then fail as a Mongoose ValidationError, surfacing
 * as an opaque 500 instead of a clean 400.
 */
const CONSULTATION_LIMITS = {
  chiefComplaint: 1000,
  diagnosis: 1000,
  symptoms: 2000,
  clinicalNotes: 5000,
  treatmentPlan: 3000,
  treatmentOutcome: 2000,
  doctorNotes: 2000,
};

/** Vitals are all optional individually but rejected if wholly absent. */
const vitalRules = [
  // Ranges mirror Consultation.vitalsSchema exactly. They had drifted: the validator
  // accepted values the schema then rejected, which surfaced as an unhandled
  // Mongoose validation error (500) instead of a clean 400 - e.g. heart rate 251-260,
  // temperature 25-29.9, respiratory rate 4, weight 401-500. The schema is the
  // storage contract, so it wins.
  body("vitals.bloodPressureSystolic").optional().isFloat({ min: 40, max: 300 }).withMessage("Systolic pressure looks wrong"),
  body("vitals.bloodPressureDiastolic").optional().isFloat({ min: 20, max: 200 }).withMessage("Diastolic pressure looks wrong"),
  body("vitals.heartRate").optional().isFloat({ min: 20, max: 250 }).withMessage("Heart rate must be between 20 and 250"),
  body("vitals.temperature").optional().isFloat({ min: 30, max: 45 }).withMessage("Temperature must be between 30 and 45"),
  body("vitals.respiratoryRate").optional().isFloat({ min: 4, max: 80 }).withMessage("Respiratory rate must be between 4 and 80"),
  body("vitals.spo2").optional().isFloat({ min: 50, max: 100 }).withMessage("SpO2 must be between 50 and 100"),
  body("vitals.weight").optional().isFloat({ min: 0.5, max: 500 }).withMessage("Weight must be between 0.5 and 500"),
  body("vitals.height").optional().isFloat({ min: 20, max: 260 }).withMessage("Height must be between 20 and 260"),
  // Was unvalidated, so any typo reached the schema enum and 500'd.
  body("vitals.flag").optional().isIn(["NORMAL", "ABNORMAL"]).withMessage("Vitals flag must be NORMAL or ABNORMAL"),
  shortText(500, "vitals.notes"),
];

const validateCreateConsultation = [
  body("patient").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a patient"),
  body("appointment")
    .optional({ values: "falsy" })
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("That appointment is not a valid id"),
  body("chiefComplaint")
    .trim()
    .notEmpty()
    .withMessage("Please record the patient's chief complaint")
    .isLength({ max: CONSULTATION_LIMITS.chiefComplaint })
    .withMessage(`Chief complaint must be ${CONSULTATION_LIMITS.chiefComplaint} characters or fewer`),
  body("diagnosis")
    .trim()
    .notEmpty()
    .withMessage("Please record a diagnosis")
    .isLength({ max: CONSULTATION_LIMITS.diagnosis })
    .withMessage(`Diagnosis must be ${CONSULTATION_LIMITS.diagnosis} characters or fewer`),
  shortText(CONSULTATION_LIMITS.symptoms, "symptoms"),
  shortText(CONSULTATION_LIMITS.clinicalNotes, "clinicalNotes"),
  shortText(CONSULTATION_LIMITS.treatmentPlan, "treatmentPlan"),
  ...vitalRules,
];

const validateUpdateConsultation = [
  body("chiefComplaint")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Chief complaint cannot be empty")
    .isLength({ max: CONSULTATION_LIMITS.chiefComplaint })
    .withMessage(`Chief complaint must be ${CONSULTATION_LIMITS.chiefComplaint} characters or fewer`),
  body("diagnosis")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Diagnosis cannot be empty")
    .isLength({ max: CONSULTATION_LIMITS.diagnosis })
    .withMessage(`Diagnosis must be ${CONSULTATION_LIMITS.diagnosis} characters or fewer`),
  shortText(CONSULTATION_LIMITS.symptoms, "symptoms"),
  shortText(CONSULTATION_LIMITS.clinicalNotes, "clinicalNotes"),
  shortText(CONSULTATION_LIMITS.treatmentPlan, "treatmentPlan"),
  shortText(CONSULTATION_LIMITS.treatmentOutcome, "treatmentOutcome"),
  shortText(CONSULTATION_LIMITS.doctorNotes, "doctorNotes"),
  // The edit endpoint had no vitals rules at all, so an out-of-range vital sent from
  // the consultation screen went straight to Mongoose and surfaced as a 500. The same
  // rules the create path uses are reused here so both edges behave identically.
  ...vitalRules,
  body("allowClinicalEdit")
    .optional()
    .isBoolean()
    .withMessage("allowClinicalEdit must be true or false")
    .toBoolean(),
  body("editReason")
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage("Give a reason of at least 10 characters when amending a completed consultation"),
  ...vitalRules,
];

const validateCompleteConsultation = [
  body("diagnosis")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Diagnosis cannot be empty")
    .isLength({ max: CONSULTATION_LIMITS.diagnosis })
    .withMessage(`Diagnosis must be ${CONSULTATION_LIMITS.diagnosis} characters or fewer`),
  shortText(CONSULTATION_LIMITS.treatmentPlan, "treatmentPlan"),
  shortText(CONSULTATION_LIMITS.treatmentOutcome, "treatmentOutcome"),
  shortText(CONSULTATION_LIMITS.clinicalNotes, "clinicalNotes"),
  ...vitalRules,
];

const validateListConsultations = [
  qObjectId("patient", "Patient"),
  query("status")
    .optional()
    .isIn(Consultation.CONSULTATION_STATUSES)
    .withMessage("That consultation status is not recognised"),
  query("search").optional().trim().isLength({ max: 120 }).withMessage("Search text is too long"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or greater"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

// ---- Prescriptions (FR-DR-03, FR-DR-04) --------------------------------

const validateCreatePrescription = [
  body("patient").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a patient"),
  body("consultation")
    .optional({ values: "falsy" })
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("That consultation is not a valid id"),
  body("items").isArray({ min: 1, max: 20 }).withMessage("Add between 1 and 20 medicines"),
  // Wildcard rules apply the same checks to every element of `items[*]`.
  body("items.*.medicine").trim().notEmpty().withMessage("Medicine name is required"),
  body("items.*.dosage").trim().notEmpty().withMessage("Dosage is required"),
  body("items.*.duration").trim().notEmpty().withMessage("Duration is required"),
  body("items.*.frequency")
    .optional()
    .isIn(Prescription.FREQUENCIES)
    .withMessage("That dosing frequency is not recognised"),
  body("items.*.route")
    .optional()
    .isIn(Prescription.ROUTES)
    .withMessage("That route is not recognised"),
  body("items.*.quantity")
    .optional({ values: "falsy" })
    .isFloat({ min: 0 })
    .withMessage("Quantity must be a positive number"),
  body("items.*.instructions").optional().trim().isLength({ max: 500 }).withMessage("Instructions must be 500 characters or fewer"),
  // Mirrors Prescription.notes maxlength.
  shortText(1000, "notes"),
  body("followUpDate").optional({ values: "falsy" }).isISO8601().withMessage("Follow-up date is not valid"),
];

const validateListPrescriptions = [
  qObjectId("patient", "Patient"),
  query("status")
    .optional()
    .isIn(Prescription.PRESCRIPTION_STATUSES)
    .withMessage("That prescription status is not recognised"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or greater"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

// ---- Laboratory reports (FR-DR-07, FR-DR-08) ---------------------------

const validateListReports = [
  qObjectId("patient", "Patient"),
  qObjectId("test", "Laboratory test"),
  query("reviewed").optional().isBoolean().withMessage("reviewed must be true or false"),
  query("search").optional().trim().isLength({ max: 120 }).withMessage("Search text is too long"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or greater"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

const validateReportHistory = [
  query("patient").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a patient"),
  query("test").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a laboratory test"),
  query("limit").optional().isInt({ min: 1, max: 20 }).withMessage("Limit must be between 1 and 20"),
];

const validateCompareReports = [
  query("report").custom((value) => isValidObjectId(String(value))).withMessage("Choose a report to compare"),
  query("previousReport")
    .optional({ values: "falsy" })
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("The earlier report is not a valid id"),
];

const validateReportComment = [
  // Mirrors the LabReport doctorComments sub-schema limits.
  body("comment")
    .trim()
    .notEmpty()
    .withMessage("Please write a comment")
    .isLength({ max: 2000 })
    .withMessage("Comment must be 2000 characters or fewer"),
  shortText(2000, "interpretation"),
  shortText(2000, "treatmentDecision"),
  shortText(2000, "outcome"),
];

// ---- Patients / history (FR-DR-02) -------------------------------------

const validateHistoryQuery = [
  query("since").optional().isISO8601().withMessage("`since` must be a valid date"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

// ---- Doctor laboratory orders (FR-DR-05, FR-DR-06) ---------------------

const validateCreateLabRequest = [
  body("patient").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a patient"),
  body("test").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a laboratory test"),
  // FR-DR-06: the appointment is what ties the order back to the visit. Optional
  // so a request raised outside a booked slot (an urgent STAT) is still allowed.
  body("appointment")
    .optional({ values: "falsy" })
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("That appointment is not a valid id"),
  // The consultation that prompted the order, so the clinical timeline can show
  // which test came out of which visit. Optional, and checked for real ownership in
  // `doctorLabOrder.service`, not merely for being a well-formed id.
  body("consultation")
    .optional({ values: "falsy" })
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("That consultation is not a valid id"),
  body("priority")
    .optional()
    .isIn(["ROUTINE", "URGENT", "STAT", "routine", "urgent", "stat"])
    .withMessage("Priority must be ROUTINE, URGENT or STAT"),
  shortText(1000, "clinicalNotes"),
];

const validateSearch = [
  query("search").optional().trim().isLength({ max: 120 }).withMessage("Search text is too long"),
];

// ---- Notifications / profile / settings --------------------------------

const validateNotificationId = [objectId("id", "Notification")];

const validateNotificationQuery = [
  query("unread").optional().isBoolean().withMessage("`unread` must be true or false"),
  query("read").optional().isBoolean().withMessage("`read` must be true or false"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

/**
 * Only self-service clinical fields. `role`, `status`, `isActive` and
 * `nmcNumber` are absent on purpose - the first three are Admin controls and the
 * NMC number is the licence identifier behind the one-account-per-doctor index.
 */
const validateUpdateDoctorProfile = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty").isLength({ max: 120 }).withMessage("Name is too long"),
  body("phone").optional({ values: "falsy" }).trim().isLength({ max: 40 }).withMessage("Phone is too long"),
  body("contactNumber").optional({ values: "falsy" }).trim().isLength({ max: 40 }).withMessage("Contact number is too long"),
  shortText(300, "address"),
  shortText(120, "department"),
  shortText(200, "qualification"),
  shortText(200, "specialization"),
];

const validateUpdateDoctorSettings = [
  // Flat, not nested: express-validator takes a flat chain, and a nested array
  // would silently validate nothing.
  ...["appointmentAlerts", "followUpAlerts", "labReportAlerts", "emailNotifications"].map((field) =>
    body(field).optional().isBoolean().withMessage(`${field} must be true or false`)
  ),
];

// ---- Care team (Admin) --------------------------------------------------

const validateAssignPatient = [
  body("patientId").custom((value) => isValidObjectId(String(value))).withMessage("Please choose a patient"),
  body("relationship")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Relationship must be 120 characters or fewer"),
];

module.exports = {
  handleValidationErrors,
  validateAppointmentId,
  validateConsultationId,
  validatePrescriptionId,
  validatePatientId,
  validateDoctorId,
  validateReportId,
  validateListAppointments,
  validateBookAppointment,
  validateUpdateAppointmentStatus,
  validateCreateConsultation,
  validateUpdateConsultation,
  validateCompleteConsultation,
  validateListConsultations,
  validateCreatePrescription,
  validateListPrescriptions,
  validateListReports,
  validateReportHistory,
  validateCompareReports,
  validateReportComment,
  validateHistoryQuery,
  validateCreateLabRequest,
  validateSearch,
  validateNotificationId,
  validateNotificationQuery,
  validateUpdateDoctorProfile,
  validateUpdateDoctorSettings,
  validateAssignPatient,
};
