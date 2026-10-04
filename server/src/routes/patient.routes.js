const express = require("express");
const { protect, blockUntilPasswordChanged } = require("../middleware/auth");
const { authorize } = require("../middleware/role.middleware");
const { ROLES } = require("../config/roles");
const { handleValidationErrors } = require("../validators/validationHandler");
const v = require("../validators/patientValidator");
const patient = require("../controllers/patient.controller");

/**
 * Patient module (FR-PT-01 .. FR-PT-10).
 *
 * `protect`                   - valid JWT, APPROVED and active account.
 * `authorize(PATIENT)`        - the exact role. An Admin, Doctor or Laboratory
 *                               token gets 403 here even though the SPA renders
 *                               nothing for it.
 * `blockUntilPasswordChanged` - a temporary password cannot reach these screens.
 *
 * The three guards apply to the whole router via `router.use`, so a route added
 * later is protected by default rather than by remembering to add them.
 *
 * PER-PATIENT OWNERSHIP IS NOT EXPRESSED HERE, and that is deliberate. There is no
 * `:patientId` segment on any route, so a patient cannot address another patient's
 * record in the first place. Every handler reads `req.user._id`, and the services
 * add `{ patient: <that id> }` to each query. Ownership is re-checked against the
 * database on every request rather than trusted from the URL.
 */
const router = express.Router();
router.use(protect, authorize(ROLES.PATIENT), blockUntilPasswordChanged);

// ---- Account (FR-PT-08, FR-PT-10) ----
router.get("/profile", patient.getProfile);
router.patch("/profile", v.validateProfileUpdate, handleValidationErrors, patient.updateProfile);

// ---- Dashboard (FR-PT-02) ----
router.get("/dashboard", patient.getDashboard);

/** Bookable doctor directory. Public fields only - never a doctor's patient list. */
router.get("/doctors", v.validateListQuery, handleValidationErrors, patient.listDoctors);

// ---- Appointments (FR-PT-01) ----
router.get("/appointments", v.validateListQuery, v.validateStatusFilter, handleValidationErrors, patient.listAppointments);
router.get(
  "/appointments/availability",
  v.validateAvailability,
  handleValidationErrors,
  patient.getAvailability
);
router.post("/appointments", v.validateBooking, handleValidationErrors, patient.bookAppointment);
router.patch(
  "/appointments/:id/cancel",
  v.validateAppointmentId,
  v.validateCancellation,
  handleValidationErrors,
  patient.cancelAppointment
);

// ---- Follow-ups (FR-PT-05) ----
// Follow-ups are appointments with type FOLLOW_UP, not a separate collection.
router.get("/follow-ups", v.validateListQuery, handleValidationErrors, patient.listFollowUps);

// ---- Clinical history (FR-PT-03, FR-PT-04) ----
router.get("/consultations", v.validateListQuery, handleValidationErrors, patient.listConsultations);
router.get("/medical-history", v.validateListQuery, handleValidationErrors, patient.getMedicalHistory);

// ---- Prescriptions (FR-PT-06) ----
router.get("/prescriptions", v.validateListQuery, handleValidationErrors, patient.listPrescriptions);
router.get(
  "/prescriptions/:id/document",
  v.validatePrescriptionId,
  handleValidationErrors,
  patient.getPrescriptionDocument
);
/** The same PDF the doctor downloads - one renderer, one document. */
router.get(
  "/prescriptions/:id/document.pdf",
  v.validatePrescriptionId,
  handleValidationErrors,
  patient.getPrescriptionPdf
);

// ---- Laboratory (FR-PT-07) ----
router.get("/lab-requests", v.validateListQuery, handleValidationErrors, patient.listLabRequests);
router.get("/lab-reports", v.validateListQuery, handleValidationErrors, patient.listLabReports);
router.get("/lab-reports/:id", v.validateReportId, handleValidationErrors, patient.getLabReport);

// ---- Billing (FR-PT-09) ----
router.get("/payments", patient.listPayments);

// ---- Notifications ----
router.get("/notifications", patient.listNotifications);
router.get("/notifications/unread-count", patient.getUnreadCount);
router.patch("/notifications/:id/read", patient.markRead);
router.patch("/notifications/read-all", patient.markAllRead);

module.exports = router;