const adminService = require("../services/admin.service");
const accessRequestController = require("../controllers/accessRequest.controller");
const patientAccountService = require("../services/patientAccount.service");
const labService = require("../services/lab.service");
const adminDashboardService = require("../services/adminDashboard.service");
const adminAppointmentService = require("../services/adminAppointment.service");
const adminPatientService = require("../services/adminPatient.service");
const adminNotificationService = require("../services/adminNotification.service");
const adminReportService = require("../services/adminReport.service");
const billingService = require("../services/billing.service");
const scheduleService = require("../services/schedule.service");
const { buildReportPdf } = require("../utils/reportPdf");
const { buildCsv, buildSpreadsheet } = require("../utils/reportExport");
const response = require("../utils/response");

const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => {
  try {
    const data = await handler(req);
    return response.success(res, data, statusCode, successMessage);
  } catch (error) {
    return next(error);
  }
};

const actor = (req) => req.user;

/**
 * Report export.
 *
 * Written here rather than in the router because it needs the same three response
 * shapes (JSON / CSV / file) and the same filename rules for all five report
 * kinds. `report` is the already-built payload from `adminReportService`, so the
 * exported file and the on-screen table are the same data by construction.
 */
const sendExport = async (req, res, next) => {
  try {
    const format = String(req.query.format || "csv").toLowerCase();
    if (!["csv", "excel", "pdf"].includes(format)) {
      return response.error(res, `Export format "${format}" is not valid. Use csv, excel or pdf.`, 422);
    }

    const report = await adminReportService.build(req.params.kind, req.query);

    const stem = `${report.kind}-report`;
    const figures = report.figures || {};

    if (format === "csv") {
      const csv = buildCsv(report.columns, report.rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${stem}.csv"`);
      return res.status(200).send(csv);
    }

    if (format === "excel") {
      const workbook = buildSpreadsheet({ sheetName: report.title, columns: report.columns, rows: report.rows });
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${stem}.xls"`);
      return res.status(200).send(workbook);
    }

    const buffer = await buildReportPdf({
      title: report.title,
      meta: report.label
        ? [
            { label: "Period", value: report.label },
            { label: "Generated", value: new Date().toLocaleString("en-GB") },
          ]
        : [
            { label: "Date", value: report.date ? report.date.toDateString() : report.range?.from?.toDateString() },
            { label: "Generated", value: new Date().toLocaleString("en-GB") },
          ],
      figures: Object.entries(figures).map(([label, value]) => ({
        label: label.replace(/([A-Z])/g, " $1").trim(),
        value,
      })),
      columns: report.columns,
      rows: report.rows,
      footnote: report.footnote,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.pdf"`);
    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
};

const controller = {
  // Access request review
  listAccessRequests: accessRequestController.list,
  getAccessRequest: accessRequestController.detail,
  accessRequestSummary: accessRequestController.summary,
  approveAccessRequest: accessRequestController.approve,
  rejectAccessRequest: accessRequestController.reject,

  // Dashboard (FR-AD-01)
  dashboard: run((req) => adminDashboardService.buildDashboard(actor(req), req.query), "Dashboard retrieved"),
  globalSearch: run((req) => adminDashboardService.search(req.query.q || req.query.search), "Search completed"),

  // Appointments (FR-AD-02 / FR-AD-03)
  listAppointments: run((req) => adminAppointmentService.list(req.query), "Appointments retrieved"),
  getAppointment: run((req) => adminAppointmentService.getOne(req.params.id), "Appointment retrieved"),
  createAppointment: run(
    (req) => adminAppointmentService.create(req.body, actor(req), req),
    "Appointment created",
    201
  ),
  rescheduleAppointment: run(
    (req) => adminAppointmentService.reschedule(req.params.id, req.body, actor(req), req),
    "Appointment rescheduled"
  ),
  cancelAppointment: run(
    (req) => adminAppointmentService.cancel(req.params.id, req.body?.reason, actor(req), req),
    "Appointment cancelled"
  ),
  appointmentStatus: run(
    (req) => adminAppointmentService.updateStatus(req.params.id, req.body?.status, actor(req), req),
    "Appointment status updated"
  ),
  appointmentQueue: run((req) => adminAppointmentService.getQueue(req.query.date), "Queue retrieved"),

  // Doctor availability (FR-AD-04)
  listDoctors: run(
    (req) => adminService.getDoctors(req.query),
    "Doctors retrieved"
  ),
  updateDoctor: run(
    (req) => adminService.updateDoctor(req.params.doctorId, req.body, actor(req), req),
    "Doctor updated"
  ),
  listDoctorAvailability: run(
    (req) => scheduleService.listForDoctor(req.params.doctorId),
    "Availability retrieved"
  ),
  setDoctorAvailability: run(
    (req) => scheduleService.replaceForDoctor(req.params.doctorId, req.body?.windows, actor(req), req),
    "Availability saved"
  ),
  addAvailabilityWindow: run(
    (req) => scheduleService.addWindow(req.params.doctorId, req.body, actor(req), req),
    "Availability window added",
    201
  ),
  updateAvailabilityWindow: run(
    (req) => scheduleService.updateWindow(req.params.doctorId, req.params.windowId, req.body, actor(req), req),
    "Availability window updated"
  ),
  removeAvailabilityWindow: run(
    (req) => scheduleService.removeWindow(req.params.doctorId, req.params.windowId, actor(req), req),
    "Availability window removed"
  ),
  doctorAvailabilityForDate: run(
    (req) => scheduleService.buildAvailability({ doctorId: req.params.doctorId, date: req.query.date, durationMinutes: req.query.durationMinutes }),
    "Slots retrieved"
  ),

  // Patients (FR-AD-02)
  listPatients: run((req) => adminPatientService.listPatients(req.query), "Patients retrieved"),
  getPatient: run((req) => adminPatientService.getPatient(req.params.id, req.query), "Patient retrieved"),
  updatePatient: run(
    (req) => adminPatientService.updatePatient(req.params.id, req.body, actor(req), req),
    "Patient updated successfully"
  ),

  // Laboratory coordination (FR-AD-06)
  laboratoryOverview: run(() => labService.getDashboard(), "Laboratory overview retrieved"),

  // Billing (FR-AD-07)
  listInvoices: run((req) => billingService.listInvoices(req.query), "Invoices retrieved"),
  getInvoice: run((req) => billingService.getInvoice(req.params.id), "Invoice retrieved"),
  createInvoice: run((req) => billingService.createInvoice(req.body, actor(req), req), "Invoice issued", 201),
  recordPayment: run(
    (req) => billingService.recordPayment(req.body, actor(req), req),
    "Payment recorded",
    201
  ),
  voidInvoice: run((req) => billingService.voidInvoice(req.params.id, req.body?.reason, actor(req), req), "Invoice voided"),
  listPayments: run((req) => billingService.listPayments(req.query), "Payments retrieved"),
  billingSummary: run((req) => billingService.getSummary(req.query), "Billing summary retrieved"),

  // Reports (FR-AD-05)
  buildReport: run((req) => adminReportService.build(req.params.kind, req.query), "Report generated"),
  exportReport: sendExport,
  reportPatients: run((req) => adminReportService.searchPatients(req.query), "Patients retrieved"),

  // Notifications
  listNotifications: run(
    (req) => adminNotificationService.list(actor(req)._id, req.query),
    "Notifications retrieved"
  ),
  unreadNotificationCount: run((req) => adminNotificationService.unreadCount(actor(req)._id), "Unread count retrieved"),
  markNotificationRead: run(
    (req) => adminNotificationService.markRead(actor(req)._id, req.params.id),
    "Notification marked read"
  ),
  markAllNotificationsRead: run(
    (req) => adminNotificationService.markAllRead(actor(req)._id),
    "All notifications marked read"
  ),

  // Profile & settings
  myProfile: run((req) => adminPatientService.getMyProfile(actor(req)._id), "Profile retrieved"),
  updateMyProfile: run(
    (req) => adminPatientService.updateMyProfile(actor(req)._id, req.body, actor(req), req),
    "Profile updated successfully"
  ),
  mySettings: run((req) => adminPatientService.getMySettings(actor(req)._id), "Settings retrieved"),
  updateMySettings: run((req) => adminPatientService.updateMySettings(actor(req)._id, req.body, actor(req)), "Settings updated successfully"),

  // User management (existing)
  createPatient: run(
    (req) => patientAccountService.createPatientAccount(req.body, actor(req)),
    "Patient account created and temporary password emailed",
    201
  ),
  listUsers: run((req) => adminService.getUsers(req.query), "Users retrieved"),
  updateUserRole: run(
    (req) => adminService.updateUserRole(req.params.id, req.body, actor(req)),
    "User role updated successfully"
  ),
  updateUserStatus: run(
    (req) => adminService.setUserStatus(req.params.id, req.body, actor(req)),
    "User status updated successfully"
  ),
  deleteUser: run((req) => adminService.deleteUser(req.params.id, actor(req)), "User deleted successfully"),
};

module.exports = controller;