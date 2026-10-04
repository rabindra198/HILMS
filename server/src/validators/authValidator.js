const { body } = require("express-validator");
const { handleValidationErrors } = require("./validationHandler");

/**
 * Public self-registration (signup / register) has been removed from this
 * project. New Patient / Doctor / Laboratory accounts are created exclusively
 * through the administrator-reviewed "Request Access" flow, so there is
 * deliberately no signup validator and no public role-accepting endpoint.
 */

const validateLogin = [
  body("email").isEmail().withMessage("Please enter a valid email").normalizeEmail({ gmail_remove_dots: false }),
  body("password").notEmpty().withMessage("Password is required"),
  // FR-AUTH-08: optional trusted-device flag. `loose` also accepts the string
  // "true"/"false" that an HTML form may send.
  body("remember")
    .optional({ values: "falsy" })
    .isBoolean({ loose: true })
    .withMessage("Remember me must be true or false")
    .toBoolean(),
];

const validateRoleUpdate = [
  body("role")
    .trim()
    .notEmpty()
    .withMessage("Please select a valid role")
    .isIn(["admin", "doctor", "lab", "patient", "laboratory"])
    .withMessage("Please select a valid role"),
];

/**
 * Admin/system-initiated Patient provisioning.
 *
 * No `password` field is accepted here on purpose - the backend generates the
 * temporary credential and emails it, so accepting one from the request would
 * create a path where a weak or logged password reaches the database.
 */
const validateCreatePatient = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Patient name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("email")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail({ gmail_remove_dots: false }),
  body("contactNumber")
    .optional({ values: "falsy" })
    .trim()
    .matches(/^[+\d][\d\s\-()]{6,19}$/)
    .withMessage("Please enter a valid contact number"),
  body("address")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 300 })
    .withMessage("Address must be 300 characters or fewer"),
  // Reject rather than strip: silently dropping a client-supplied password or
  // role would hide a client bug and weaken the "backend owns the credential"
  // guarantee.
  body().custom((value) => {
    if (value && Object.prototype.hasOwnProperty.call(value, "password")) {
      throw new Error("A temporary password is generated and emailed automatically; do not supply one");
    }
    return true;
  }),
  body("role").custom((value, { req }) => {
    if (value !== undefined && String(value).toLowerCase() !== "patient") {
      throw new Error("This endpoint only creates Patient accounts");
    }
    return true;
  }),
];

module.exports = {
  validateLogin,
  validateRoleUpdate,
  validateCreatePatient,
  handleValidationErrors,
};
