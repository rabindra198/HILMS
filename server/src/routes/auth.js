const express = require("express");
const { login, logout, getMe, listSessions, revokeAllSessions } = require("../controllers/authController");
const accessRequestController = require("../controllers/accessRequest.controller");
const passwordController = require("../controllers/password.controller");
const { verifyToken } = require("../middleware/auth");
const { validateLogin, handleValidationErrors } = require("../validators/authValidator");
const {
  validatePatientRegistration,
  validateStaffAccessRequest,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
} = require("../validators/accessRequestValidator");

const router = express.Router();

/**
 * Public authentication surface.
 *
 * There is intentionally NO /signup or /register endpoint that takes a role
 * from the client. Instead there are two distinct public paths, matching SRS
 * 2.6 ("Only Patients can self-register; all other accounts are created by an
 * Admin"):
 *
 *   POST /auth/register/patient   -> creates an ACTIVE Patient account now
 *   POST /auth/access-requests    -> creates a PENDING Doctor/Lab request only
 *
 * A Doctor or Laboratory applicant never supplies a password; one is generated
 * by the backend when an Admin approves the request.
 */
router.post("/login", validateLogin, handleValidationErrors, login);
router.post("/logout", logout);
router.get("/me", verifyToken, getMe);

// FR-AUTH-09: the user's recent sign-ins, and a "sign out everywhere" control.
// Both are scoped to the session user - no id is accepted.
router.get("/sessions", verifyToken, listSessions);
router.delete("/sessions", verifyToken, revokeAllSessions);

// Patient self-registration (SRS FR-AUTH-02).
router.post(
  "/register/patient",
  validatePatientRegistration,
  handleValidationErrors,
  accessRequestController.registerPatient
);

// Doctor / Laboratory access request (creates a PENDING record, no account).
router.post(
  "/access-requests",
  validateStaffAccessRequest,
  handleValidationErrors,
  accessRequestController.submit
);

// Password recovery.
router.post(
  "/forgot-password",
  validateForgotPassword,
  handleValidationErrors,
  passwordController.forgotPassword
);
router.post(
  "/reset-password",
  validateResetPassword,
  handleValidationErrors,
  passwordController.resetPassword
);
router.patch(
  "/change-password",
  verifyToken,
  validateChangePassword,
  handleValidationErrors,
  passwordController.changePassword
);

module.exports = router;
