const express = require("express");

const router = express.Router();
const { protect, isAdmin, blockUntilPasswordChanged } = require("../middleware/auth");
const { validateReviewNotes, validateRequestIdParam, handleValidationErrors } = require("../validators/accessRequestValidator");
const { validateRoleUpdate } = require("../validators/authValidator");
const { validateCreatePatient } = require("../validators/authValidator");
const controller = require("../controllers/adminController");
const careTeamController = require("../controllers/adminCareTeam.controller");
const adminService = require("../services/admin.service");
const accessRequestService = require("../services/accessRequest.service");
const {
  validateAssignPatient,
  validateDoctorId,
  validatePatientId,
} = require("../validators/doctorValidator");
const AuditLog = require("../models/AuditLog");
const response = require("../utils/response");

/**
 * Administrator surface.
 *
 * `protect`  - requires a valid JWT and an APPROVED, active account.
 * `isAdmin`  - requires the Admin role.
 * `blockUntilPasswordChanged` - refuses any account still holding an
 *   Admin-issued temporary password.
 *
 * All three checks run on every route below, so a Patient / Doctor /
 * Laboratory token receives 403 Forbidden here regardless of what the frontend
 * renders.
 *
 * `/:id` style routes are declared after their sibling literals on purpose.
 * Express matches in registration order, so `/patients/search` or
 * `/notifications/unread-count` registered after `/patients/:id` would be
 * swallowed by the parameterised route and looked up as a patient id.
 */
router.use(protect, isAdmin, blockUntilPasswordChanged);

router.get("/", (req, res) => {
  res.status(200).json({ success: true, message: "Admin API is running" });
});

// ---- Access request review ----
router.get("/access-requests", controller.listAccessRequests);
router.get("/access-requests/summary", controller.accessRequestSummary);
router.get("/access-requests/:id", validateRequestIdParam, handleValidationErrors, controller.getAccessRequest);
router.patch(
  "/access-requests/:id/approve",
  validateRequestIdParam,
  validateReviewNotes,
  handleValidationErrors,
  controller.approveAccessRequest
);
router.patch(
  "/access-requests/:id/reject",
  validateRequestIdParam,
  validateReviewNotes,
  handleValidationErrors,
  controller.rejectAccessRequest
);

// ---- Dashboard (FR-AD-01) ----
// One endpoint, because the four cards and the lists beneath them must come from
// one set of filters: a dashboard where "86 appointments today" is counted
// differently from the table of 86 appointments below it is worse than no number.
router.get("/dashboard", controller.dashboard);
router.get("/search", controller.globalSearch);

// ---- Appointments (FR-AD-02) ----
router.get("/appointments", controller.listAppointments);
router.get("/appointments/queue", controller.appointmentQueue);
router.post("/appointments", controller.createAppointment);
router.get("/appointments/:id", controller.getAppointment);
router.patch("/appointments/:id/reschedule", controller.rescheduleAppointment);
router.patch("/appointments/:id/cancel", controller.cancelAppointment);
router.patch("/appointments/:id/status", controller.appointmentStatus);

// ---- Doctor availability (FR-AD-04) ----
router.get("/doctors", controller.listDoctors);
// Professional details incl. consultation fee, which billing prices
// consultation lines from. Registered before the `/doctors/:doctorId/*`
// availability routes so the fee is editable from the same screen.
router.patch("/doctors/:doctorId", controller.updateDoctor);
router.get("/doctors/:doctorId/availability", controller.listDoctorAvailability);
router.put("/doctors/:doctorId/availability", controller.setDoctorAvailability);
router.post("/doctors/:doctorId/availability", controller.addAvailabilityWindow);
router.patch("/doctors/:doctorId/availability/:windowId", controller.updateAvailabilityWindow);
router.delete("/doctors/:doctorId/availability/:windowId", controller.removeAvailabilityWindow);
router.get("/doctors/:doctorId/slots", controller.doctorAvailabilityForDate);

// ---- Patients (FR-AD-02) ----
// Admin/system-initiated Patient provisioning. A temporary password is generated
// and emailed; it is never accepted from or returned to the caller.
router.post("/patients", validateCreatePatient, handleValidationErrors, controller.createPatient);
router.get("/patients", controller.listPatients);
router.get("/patients/:id", controller.getPatient);
router.patch("/patients/:id", controller.updatePatient);

// ---- Laboratory coordination (FR-AD-06) ----
router.get("/laboratory", controller.laboratoryOverview);

// ---- Billing (FR-AD-07) ----
router.get("/billing/summary", controller.billingSummary);
router.get("/billing/invoices", controller.listInvoices);
router.get("/billing/invoices/:id", controller.getInvoice);
router.post("/billing/invoices", controller.createInvoice);
router.patch("/billing/invoices/:id/void", controller.voidInvoice);
router.get("/billing/payments", controller.listPayments);
router.post("/billing/payments", controller.recordPayment);

// ---- Reports (FR-AD-05) ----
// The export handler reads the same `adminReportService.build` output as the JSON
// route below, so a downloaded file can never disagree with the screen.
router.get("/reports/export/:kind", controller.exportReport);
router.get("/reports/patients", controller.reportPatients);
router.get("/reports/:kind", controller.buildReport);

// ---- Notifications ----
router.get("/notifications", controller.listNotifications);
router.get("/notifications/unread-count", controller.unreadNotificationCount);
router.patch("/notifications/read-all", controller.markAllNotificationsRead);
router.patch("/notifications/:id/read", controller.markNotificationRead);

// ---- Profile & settings ----
router.get("/profile", controller.myProfile);
router.patch("/profile", controller.updateMyProfile);
router.get("/settings", controller.mySettings);
router.patch("/settings", controller.updateMySettings);

// ---- User management ----
router.get("/users", controller.listUsers);
router.patch("/users/:id/role", validateRoleUpdate, handleValidationErrors, controller.updateUserRole);
router.patch("/users/:id/status", handleValidationErrors, controller.updateUserStatus);
router.delete("/users/:id", controller.deleteUser);

// ---- Care team management (section 25) ----
// The doctor/patient relationship is Admin-controlled: it is what grants a
// doctor access to a patient's clinical records, so a doctor must not be able to
// grant it to themselves. Reassignment is revoke-then-assign so the audit log
// records both halves of the move rather than a silent overwrite.
router.get("/care-team", careTeamController.listAssignments);
router.post(
  "/doctors/:doctorId/patients",
  validateDoctorId,
  validateAssignPatient,
  handleValidationErrors,
  careTeamController.assign
);
router.patch(
  "/doctors/:doctorId/patients/:patientId/reassign",
  validateDoctorId,
  validatePatientId,
  handleValidationErrors,
  careTeamController.reassign
);
router.delete(
  "/doctors/:doctorId/patients/:patientId",
  validateDoctorId,
  validatePatientId,
  handleValidationErrors,
  careTeamController.revoke
);

// ---- System overview (role/status counts + pending access requests) ----
router.get("/overview", async (req, res, next) => {
  try {
    const [overview, accessSummary] = await Promise.all([
      adminService.getSystemOverview(),
      accessRequestService.getSummary(),
    ]);
    return response.success(res, { ...overview, accessRequests: accessSummary }, 200, "System overview");
  } catch (error) {
    return next(error);
  }
});

// ---- Read-only audit trail of security-relevant actions ----
router.get("/audit-logs", async (req, res, next) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 100, 500);
    const logs = await AuditLog.find()
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return response.success(res, logs, 200, "Audit log retrieved");
  } catch (error) {
    return next(error);
  }
});

module.exports = router;