const { body, param, query } = require("express-validator");
const { isValidObjectId } = require("mongoose");

/**
 * Input validation for the patient module.
 *
 * Same split as `doctorValidator`: transport-shape rules live here (is this an id,
 * is this a date, is the field present), while record-ownership and business-rule
 * checks live in the services because a validator cannot see the database.
 *
 * Note what is deliberately NOT validated here: nothing in this file accepts a
 * patient identifier. The patient's identity comes from the verified session in
 * `req.user`, so there is no field a client could tamper with to become someone
 * else.
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

const optionalText = (max, label) =>
  body(label).optional().trim().isLength({ max }).withMessage(`${label} must be ${max} characters or fewer`);

// ---- Params --------------------------------------------------------------

const validatePrescriptionId = [objectId("id", "Prescription")];
const validateReportId = [objectId("id", "Laboratory report")];
const validateAppointmentId = [objectId("id", "Appointment")];

// ---- Appointment booking (FR-PT-01) -------------------------------------

const validateBooking = [
  body("doctorId")
    .custom((value) => isValidObjectId(String(value)))
    .withMessage("Please select a doctor"),
  body("appointmentDate")
    .isISO8601()
    .withMessage("Please select a valid appointment date"),
  body("startTime")
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage("Please select a valid appointment time"),
  body("durationMinutes")
    .optional()
    .isInt({ min: 15, max: 120 })
    .withMessage("Appointment length must be between 15 and 120 minutes"),
  body("reason")
    .trim()
    .isLength({ min: 3, max: 300 })
    .withMessage("Please give a short reason for your visit (3-300 characters)"),
  // A patient may only ever request a consultation; follow-ups are a doctor action.
  body("type")
    .optional()
    .isIn(["CONSULTATION", "consultation"])
    .withMessage("Patients can only request consultation appointments"),
];

// ---- Cancellation -------------------------------------------------------

const validateCancellation = [
  optionalText(300, "reason"),
];

// ---- Availability -------------------------------------------------------

const validateAvailability = [
  qObjectId("doctorId", "Doctor"),
  query("date")
    .optional()
    .isISO8601()
    .withMessage("Please select a valid date"),
];

// ---- Profile (FR-PT-08) -------------------------------------------------

const validateProfileUpdate = [
  body("name").optional().trim().isLength({ min: 2, max: 120 }).withMessage("Name must be 2-120 characters"),
  body("phone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 40 })
    .withMessage("Phone number must be 40 characters or fewer"),
  body("contactNumber")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 40 })
    .withMessage("Contact number must be 40 characters or fewer"),
  body("address").optional({ nullable: true }).trim().isLength({ max: 300 }).withMessage("Address must be 300 characters or fewer"),
  body("dateOfBirth")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Please provide a valid date of birth"),
  body("gender")
    .optional({ nullable: true })
    .isIn(["male", "female", "other", ""])
    .withMessage("Please select a valid gender"),
  body("bloodGroup")
    .optional({ nullable: true })
    .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""])
    .withMessage("Please select a valid blood group"),
  body("allergies").optional({ nullable: true }).trim().isLength({ max: 1000 }).withMessage("Allergies must be 1000 characters or fewer"),
  body("emergencyContactName").optional({ nullable: true }).trim().isLength({ max: 120 }).withMessage("Emergency contact name must be 120 characters or fewer"),
  body("emergencyContactNumber").optional({ nullable: true }).trim().isLength({ max: 40 }).withMessage("Emergency contact number must be 40 characters or fewer"),
];

// ---- List filters -------------------------------------------------------

const validateListQuery = [
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be 1 or greater"),
];

const validateStatusFilter = [
  query("status")
    .optional()
    .isIn([
      "SCHEDULED",
      "CONFIRMED",
      "IN_CONSULTATION",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
      "PENDING",
      "ACCEPTED",
      "SAMPLE_COLLECTED",
      "PROCESSING",
      "VERIFIED",
      "ISSUED",
    ])
    .withMessage("Please choose a valid status filter"),
];

module.exports = {
  validatePrescriptionId,
  validateReportId,
  validateAppointmentId,
  validateBooking,
  validateCancellation,
  validateAvailability,
  validateProfileUpdate,
  validateListQuery,
  validateStatusFilter,
};
