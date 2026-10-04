const { body, param } = require("express-validator");
const { ADMIN_APPROVAL_ROLES, ROLES } = require("../config/roles");
const { handleValidationErrors } = require("./validationHandler");

const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;

const nameField = () =>
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 120 })
    .withMessage("Name must be between 2 and 120 characters");

const emailField = () =>
  body("email")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail({ gmail_remove_dots: false });

const contactNumberField = () =>
  body("contactNumber")
    .trim()
    .notEmpty()
    .withMessage("Contact number is required")
    .matches(PHONE_PATTERN)
    .withMessage("Please enter a valid contact number");

const addressField = () =>
  body("address")
    .trim()
    .notEmpty()
    .withMessage("Address is required")
    .isLength({ min: 5, max: 300 })
    .withMessage("Address must be between 5 and 300 characters");

const passwordFields = (label = "Password") => [
  body("password")
    .isLength({ min: 6 })
    .withMessage(`${label} must be at least 6 characters`),
  body("confirmPassword")
    .notEmpty()
    .withMessage(`Please confirm your ${label.toLowerCase()}`)
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
];

/**
 * Patient self-registration (SRS 2.6 / FR-AUTH-02).
 *
 * The role is NOT taken from the body: the endpoint always creates a Patient.
 * A supplied `role` is accepted only when it is literally "patient", so a
 * crafted body cannot smuggle in a privileged role.
 */
const validatePatientRegistration = [
  nameField(),
  emailField(),
  ...passwordFields("Password"),
  addressField(),
  contactNumberField(),
  body("role")
    .optional({ values: "falsy" })
    .trim()
    .custom((value) => {
      if (String(value).toLowerCase() !== ROLES.PATIENT) {
        throw new Error("Only patients can self-register. Doctors and Laboratory staff must request access.");
      }
      return true;
    }),
  // Never accept stray identity fields on a patient registration.
  body("nmcNumber")
    .optional({ values: "falsy" })
    .custom(() => {
      throw new Error("NMC number is not applicable to patient registration");
    }),
  body("labRegistryNumber")
    .optional({ values: "falsy" })
    .custom(() => {
      throw new Error("Laboratory registry number is not applicable to patient registration");
    }),
];

/**
 * Doctor / Laboratory access request.
 *
 * Doctor and Laboratory applicants do NOT submit a password. The backend
 * generates a temporary one when an Admin approves the request, so a supplied
 * password is rejected outright rather than silently dropped.
 *
 * Only the role-specific identity field is accepted: NMC for a Doctor,
 * laboratory registry number for Laboratory. Supplying the other one is
 * rejected so irrelevant role-specific fields are never persisted.
 */
const validateStaffAccessRequest = [
  nameField(),
  emailField(),
  addressField(),
  contactNumberField(),
  body("requestedRole")
    .trim()
    .notEmpty()
    .withMessage("Please select the role you are requesting")
    // Server-side allowlist. Patient and Admin are both rejected.
    .isIn(ADMIN_APPROVAL_ROLES)
    .withMessage(`Please select a valid role. Allowed roles: ${ADMIN_APPROVAL_ROLES.join(", ")}`),
  body("nmcNumber")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 3, max: 40 })
    .withMessage("NMC number must be between 3 and 40 characters"),
  body("labRegistryNumber")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 3, max: 40 })
    .withMessage("Laboratory registry number must be between 3 and 40 characters"),
  body("password")
    .optional({ values: "falsy" })
    .custom(() => {
      throw new Error("Doctors and Laboratory staff cannot choose a password. An administrator issues a temporary one on approval.");
    }),
  // Conditional requirements driven by the requested role: NMC for a Doctor,
  // laboratory registry number for Laboratory.
  body("requestedRole")
    .custom((value, { req }) => {
      const role = String(value).toLowerCase();
      if (role === ROLES.DOCTOR && !String(req.body.nmcNumber || "").trim()) {
        throw new Error("NMC number is required for doctor registration");
      }
      if (role === ROLES.LAB && !String(req.body.labRegistryNumber || "").trim()) {
        throw new Error("Laboratory registry number is required for laboratory registration");
      }
      // Irrelevant role-specific fields are rejected outright so they can never
      // be persisted onto the request record.
      if (role === ROLES.DOCTOR && String(req.body.labRegistryNumber || "").trim()) {
        throw new Error("Laboratory registry number is not applicable to doctor registration");
      }
      if (role === ROLES.LAB && String(req.body.nmcNumber || "").trim()) {
        throw new Error("NMC number is not applicable to laboratory registration");
      }
      return true;
    }),
];

const validateReviewNotes = [
  body("notes")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Review notes must be at most 500 characters"),
];

const validateRequestIdParam = [
  param("id").isMongoId().withMessage("Valid access request id is required"),
];

const validateForgotPassword = [
  emailField(),
];

const validateResetPassword = [
  body("token").trim().notEmpty().withMessage("Reset token is required"),
  ...passwordFields("New password"),
];

/**
 * Forced first-login change for an account holding a temporary password.
 *
 * Accepts `temporaryPassword` (the spec's name) and falls back to
 * `currentPassword` (the name long-standing clients already send), and verifies
 * the confirmation server-side rather than trusting the client to have compared
 * it - the backend is the only authority on what gets stored.
 */
const validateChangePassword = [
  body("temporaryPassword")
    .optional()
    .custom((value, { req }) => {
      if (!value && !req.body.currentPassword) {
        throw new Error("Temporary password is required");
      }
      return true;
    }),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
  body("confirmPassword")
    .optional()
    .custom((value, { req }) => {
      if (value !== undefined && value !== req.body.newPassword) {
        throw new Error("Password confirmation does not match the new password");
      }
      return true;
    }),
  body().custom((value) => {
    const current = value.temporaryPassword || value.currentPassword;
    if (current && value.newPassword === current) {
      throw new Error("New password must be different from the temporary password");
    }
    return true;
  }),
];

module.exports = {
  validatePatientRegistration,
  validateStaffAccessRequest,
  validateReviewNotes,
  validateRequestIdParam,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  handleValidationErrors,
};
