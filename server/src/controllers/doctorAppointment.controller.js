const appointmentService = require("../services/appointment.service");
const response = require("../utils/response");

/**
 * Appointments and follow-ups (FR-DR-01, FR-DR-09).
 *
 * Slot-clash detection, care-team membership and legal status transitions are all
 * enforced in the service, not here - a controller that trusted the client would
 * happily double-book a doctor.
 */

const list = async (req, res, next) => {
  try {
    const { items, pagination } = await appointmentService.list(req.user._id, req.query);
    return response.success(res, items, 200, "Appointments loaded", { pagination });
  } catch (error) {
    return next(error);
  }
};

const getOne = async (req, res, next) => {
  try {
    const appointment = await appointmentService.getOne(req.user._id, req.params.id);
    return response.success(res, appointment, 200, "Appointment loaded");
  } catch (error) {
    return next(error);
  }
};

/** Books a first visit, or a follow-up when `type` is FOLLOW_UP. */
const book = async (req, res, next) => {
  try {
    const appointment = await appointmentService.book(req.body, req.user._id, req.user);
    const message =
      appointment.type === "FOLLOW_UP" ? "Follow-up scheduled" : "Appointment booked";
    return response.success(res, appointment, 201, message);
  } catch (error) {
    return next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const appointment = await appointmentService.updateStatus(
      req.params.id,
      req.user._id,
      req.body.status,
      req.user
    );
    return response.success(res, appointment, 200, "Appointment updated");
  } catch (error) {
    return next(error);
  }
};

module.exports = { list, getOne, book, updateStatus };
