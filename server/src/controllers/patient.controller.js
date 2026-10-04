const patientService = require("../services/patient.service");
const { buildPrescriptionPdf, pdfFileName } = require("../utils/prescriptionPdf");
const response = require("../utils/response");

/**
 * Patient module controllers.
 *
 * Every handler takes the patient's identity from `req.user._id` - the user
 * record that `protect` loaded from the JWT on this very request. No handler
 * accepts a patient id from the body, the query string or the URL, so there is no
 * client-supplied value that could point these endpoints at another patient.
 */

const patientId = (req) => req.user._id;

/* ------------------------------------------------------------------ profile */

const getProfile = async (req, res, next) => {
  try {
    return response.success(res, await patientService.getProfile(patientId(req)), 200, "Profile loaded");
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await patientService.updateProfile(patientId(req), req.body);
    return response.success(res, profile, 200, "Profile updated");
  } catch (error) {
    return next(error);
  }
};

/* ---------------------------------------------------------------- dashboard */

const getDashboard = async (req, res, next) => {
  try {
    return response.success(res, await patientService.getSummary(patientId(req)), 200, "Dashboard loaded");
  } catch (error) {
    return next(error);
  }
};

/**
 * Directory of bookable doctors.
 *
 * A patient needs a doctor to book with, but the doctor's own patient list is
 * care-team gated and must stay that way. This exposes only the public directory
 * fields - never a patient's identity, never a doctor's assigned-patient count.
 */
const listDoctors = async (req, res, next) => {
  try {
    const { items, pagination } = await patientService.listDoctors(req.query);
    return response.success(res, items, 200, "Doctors loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

/* ------------------------------------------------------------- appointments */

const listAppointments = async (req, res, next) => {
  try {
    const { items, pagination } = await patientService.listAppointments(patientId(req), req.query);
    return response.success(res, items, 200, "Appointments loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

const getAvailability = async (req, res, next) => {
  try {
    const { doctor, date, clinicHours, slots } = await patientService.getAvailability(req.query);
    return response.success(res, { doctor, date, clinicHours, slots }, 200, "Availability loaded");
  } catch (error) {
    return next(error);
  }
};

const bookAppointment = async (req, res, next) => {
  try {
    const appointment = await patientService.bookAppointment(patientId(req), req.body, req.user);
    return response.success(res, appointment, 201, "Appointment requested successfully");
  } catch (error) {
    return next(error);
  }
};

const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = await patientService.cancelAppointment(
      patientId(req),
      req.params.id,
      req.body?.reason
    );
    return response.success(res, appointment, 200, "Appointment cancelled");
  } catch (error) {
    return next(error);
  }
};

const listFollowUps = async (req, res, next) => {
  try {
    const { items, pagination } = await patientService.listFollowUps(patientId(req), req.query);
    return response.success(res, items, 200, "Follow-ups loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

/* ---------------------------------------------------------------- clinical */

const listConsultations = async (req, res, next) => {
  try {
    const { items, pagination } = await patientService.listConsultations(patientId(req), req.query);
    return response.success(res, items, 200, "Consultations loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

const getMedicalHistory = async (req, res, next) => {
  try {
    return response.success(res, await patientService.getHistory(patientId(req), req.query), 200, "Medical history loaded");
  } catch (error) {
    return next(error);
  }
};

/* ------------------------------------------------------------ prescriptions */

const listPrescriptions = async (req, res, next) => {
  try {
    const { items } = await patientService.listPrescriptions(patientId(req), req.query);
    return response.success(res, items, 200, "Prescriptions loaded");
  } catch (error) {
    return next(error);
  }
};

const getPrescriptionDocument = async (req, res, next) => {
  try {
    const document = await patientService.getPrescriptionDocument(patientId(req), req.params.id);
    return response.success(res, document, 200, "Prescription document ready");
  } catch (error) {
    return next(error);
  }
};

/**
 * The patient's copy of the prescription PDF.
 *
 * Runs the SAME `buildPrescriptionPdf` over the SAME shared document payload the
 * doctor endpoint produces, so a patient downloads the identical file rather than
 * a second, patient-specific rendering. Built fully before any byte is sent, so a
 * failure is a clean JSON error rather than a truncated download.
 */
const getPrescriptionPdf = async (req, res, next) => {
  try {
    const document = await patientService.getPrescriptionDocument(patientId(req), req.params.id);
    const pdf = await buildPrescriptionPdf(document);

    const disposition = req.query.download === "true" ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Content-Disposition", `${disposition}; filename="${pdfFileName(document)}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(pdf);
  } catch (error) {
    return next(error);
  }
};

/* --------------------------------------------------------------- laboratory */

const listLabRequests = async (req, res, next) => {
  try {
    const { items } = await patientService.listLabRequests(patientId(req), req.query);
    return response.success(res, items, 200, "Laboratory requests loaded");
  } catch (error) {
    return next(error);
  }
};

const listLabReports = async (req, res, next) => {
  try {
    const { items } = await patientService.listLabReports(patientId(req), req.query);
    return response.success(res, items, 200, "Laboratory reports loaded");
  } catch (error) {
    return next(error);
  }
};

const getLabReport = async (req, res, next) => {
  try {
    return response.success(res, await patientService.getLabReport(patientId(req), req.params.id), 200, "Laboratory report loaded");
  } catch (error) {
    return next(error);
  }
};

/* ------------------------------------------------------------------ billing */

const listPayments = async (req, res, next) => {
  try {
    return response.success(res, await patientService.listPayments(patientId(req)), 200, "Billing loaded");
  } catch (error) {
    return next(error);
  }
};

/* ------------------------------------------------------------ notifications */

const listNotifications = async (req, res, next) => {
  try {
    const { items, unreadCount } = await patientService.listNotifications(patientId(req), req.query);
    return response.success(res, { items, unreadCount }, 200, "Notifications loaded");
  } catch (error) {
    return next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    return response.success(res, { unreadCount: await patientService.unreadNotificationCount(patientId(req)) }, 200, "Unread count loaded");
  } catch (error) {
    return next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    return response.success(
      res,
      await patientService.markNotificationRead(patientId(req), req.params.id),
      200,
      "Notification marked as read"
    );
  } catch (error) {
    return next(error);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    return response.success(res, await patientService.markAllNotificationsRead(patientId(req)), 200, "All notifications marked as read");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getDashboard,
  listDoctors,
  listAppointments,
  getAvailability,
  bookAppointment,
  cancelAppointment,
  listFollowUps,
  listConsultations,
  getMedicalHistory,
  listPrescriptions,
  getPrescriptionDocument,
  getPrescriptionPdf,
  listLabRequests,
  listLabReports,
  getLabReport,
  listPayments,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};