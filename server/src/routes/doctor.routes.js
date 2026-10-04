const express = require("express");
const { protect, blockUntilPasswordChanged } = require("../middleware/auth");
const { authorize } = require("../middleware/role.middleware");
const { ROLES } = require("../config/roles");
const { handleValidationErrors } = require("../validators/validationHandler");
const v = require("../validators/doctorValidator");

const dashboard = require("../controllers/doctorDashboard.controller");
const patients = require("../controllers/doctorPatient.controller");
const appointments = require("../controllers/doctorAppointment.controller");
const consultations = require("../controllers/doctorConsultation.controller");
const prescriptions = require("../controllers/doctorPrescription.controller");
const reports = require("../controllers/doctorReport.controller");
const account = require("../controllers/doctorAccount.controller");

/**
 * Doctor module (FR-DR-01 .. FR-DR-09).
 *
 * `protect`             - valid JWT, APPROVED and active account.
 * `authorize(DOCTOR)`   - the exact role. A patient token cannot reach any of
 *                         these endpoints regardless of what the SPA renders.
 * `blockUntilPasswordChanged` - an Admin-issued temporary password cannot be used
 *                         to reach clinical screens.
 *
 * The three guards apply to the whole router via `router.use`, so a route added
 * later is protected by default rather than by remembering to add them.
 *
 * Per-patient authorization is NOT expressed here. It lives in the services via
 * `careTeamService.assertAccess`, because it depends on database state and must
 * be re-checked on every single request, not only at the router.
 */
const router = express.Router();
router.use(protect, authorize(ROLES.DOCTOR), blockUntilPasswordChanged);

// ---- Dashboard (FR-DR-01) ----
router.get("/dashboard", dashboard.getDashboard);

// ---- Appointments & follow-ups (FR-DR-01, FR-DR-09) ----
router.get("/appointments", v.validateListAppointments, handleValidationErrors, appointments.list);
router.post("/appointments", v.validateBookAppointment, handleValidationErrors, appointments.book);
router.get("/appointments/:id", v.validateAppointmentId, handleValidationErrors, appointments.getOne);
router.patch(
  "/appointments/:id/status",
  v.validateAppointmentId,
  v.validateUpdateAppointmentStatus,
  handleValidationErrors,
  appointments.updateStatus
);

// ---- Patient workspace (FR-DR-02) ----
router.get("/patients", v.validateSearch, handleValidationErrors, patients.listPatients);
router.get("/patients/:patientId", v.validatePatientId, handleValidationErrors, patients.getPatient);
router.get(
  "/patients/:patientId/history",
  v.validatePatientId,
  v.validateHistoryQuery,
  handleValidationErrors,
  patients.getHistory
);
router.get(
  "/patients/:patientId/consultations",
  v.validatePatientId,
  v.validateListConsultations,
  handleValidationErrors,
  patients.getConsultations
);

// ---- Consultations (FR-DR-02, FR-DR-08) ----
router.get("/consultations", v.validateListConsultations, handleValidationErrors, consultations.list);
router.post("/consultations", v.validateCreateConsultation, handleValidationErrors, consultations.create);
router.get("/consultations/:id", v.validateConsultationId, handleValidationErrors, consultations.getOne);
router.patch(
  "/consultations/:id",
  v.validateConsultationId,
  v.validateUpdateConsultation,
  handleValidationErrors,
  consultations.update
);
router.patch(
  "/consultations/:id/complete",
  v.validateConsultationId,
  v.validateCompleteConsultation,
  handleValidationErrors,
  consultations.complete
);

// ---- Prescriptions & printable document (FR-DR-03, FR-DR-04) ----
router.get("/prescriptions", v.validateListPrescriptions, handleValidationErrors, prescriptions.list);
router.post("/prescriptions", v.validateCreatePrescription, handleValidationErrors, prescriptions.create);
router.get("/prescriptions/:id", v.validatePrescriptionId, handleValidationErrors, prescriptions.getOne);
router.get(
  "/prescriptions/:id/document",
  v.validatePrescriptionId,
  handleValidationErrors,
  prescriptions.getDocument
);
// The generated PDF. A distinct path rather than a `?format=pdf` flag on the JSON
// route, so the browser's own `Accept` header can never accidentally negotiate
// a PDF where the SPA asked for JSON.
router.get(
  "/prescriptions/:id/document.pdf",
  v.validatePrescriptionId,
  handleValidationErrors,
  prescriptions.getDocumentPdf
);

// ---- Laboratory report review & comparison (FR-DR-07, FR-DR-08) ----
router.get("/reports", v.validateListReports, handleValidationErrors, reports.list);
router.get("/reports/compare", v.validateCompareReports, handleValidationErrors, reports.compare);
router.get("/reports/history", v.validateReportHistory, handleValidationErrors, reports.history);
router.get("/reports/:id", v.validateReportId, handleValidationErrors, reports.getOne);
router.post(
  "/reports/:id/comments",
  v.validateReportId,
  v.validateReportComment,
  handleValidationErrors,
  reports.addComment
);

// ---- Notifications (SRS 8.1) ----
// Every query filters on the authenticated doctor's own id inside the service, so
// these routes carry no doctor id and cannot be pointed at another account.
router.get("/notifications", v.validateNotificationQuery, handleValidationErrors, account.notifications);
router.get("/notifications/unread-count", account.unreadNotificationCount);
router.patch("/notifications/read-all", account.readAllNotifications);
router.patch("/notifications/:id/read", v.validateNotificationId, handleValidationErrors, account.readNotification);

// ---- Profile & settings ----
// `/profile` deliberately exposes no password change: that already exists at
// `PATCH /auth/change-password` with its own current-password check and
// `mustChangePassword` handling. A second implementation would drift from it.
router.get("/profile", account.profile);
router.patch("/profile", v.validateUpdateDoctorProfile, handleValidationErrors, account.updateProfile);
router.get("/settings", account.settings);
router.patch("/settings", v.validateUpdateDoctorSettings, handleValidationErrors, account.updateSettings);

module.exports = router;
