import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import DoctorProfile from "../models/DoctorProfile.js";
import Patient from "../models/Patient.js";
import { normalizeRole } from "../config/roles.js";

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const appointmentResource = (a) => ({
  id: idOf(a._id || a.id),
  doctor: idOf(a.doctor),
  patient: idOf(a.patient),
  date: a.date,
  time: a.time,
  type: a.type,
  status: a.status,
  notes: a.notes,
  createdAt: a.createdAt || null,
});

/**
 * POST /api/appointments
 * Patient -> books for themselves (must provide a doctor)
 * Admin   -> books on behalf of a patient (provides doctor + patient)
 */
export const createAppointment = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user.role);
    const { doctor, date, time, type, notes, patient } = req.body;

    if (!doctor) {
      return res.status(400).json({ message: "Doctor is required" });
    }
    if (!isValidObjectId(doctor)) {
      return res.status(400).json({ message: "Invalid doctor id" });
    }
    if (!date) {
      return res.status(400).json({ message: "Appointment date is required" });
    }
    if (!time) {
      return res.status(400).json({ message: "Appointment time is required" });
    }

    const doctorProfile = await DoctorProfile.findById(doctor);
    if (!doctorProfile) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    let patientProfile;
    if (role === "admin") {
      if (!patient) {
        return res.status(400).json({ message: "Patient is required" });
      }
      if (!isValidObjectId(patient)) {
        const byPatientId = await Patient.findOne({ patientId: patient });
        if (!byPatientId) {
          return res.status(400).json({ message: "Invalid patient" });
        }
        patientProfile = byPatientId;
      } else {
        patientProfile = await Patient.findById(patient);
      }
      if (!patientProfile) {
        return res.status(404).json({ message: "Patient not found" });
      }
    } else if (role === "patient") {
      patientProfile = await Patient.findOne({ user: req.user._id });
      if (!patientProfile) {
        return res.status(404).json({ message: "Patient profile not found" });
      }
    } else {
      return res.status(403).json({ message: "Not authorized to create appointments" });
    }

    const appointment = await Appointment.create({
      doctor: doctorProfile._id,
      patient: patientProfile._id,
      date,
      time,
      type: type || "General Consultation",
      notes: notes || "",
      status: "Scheduled",
    });

    res.status(201).json({
      message: "Appointment booked successfully",
      appointment: appointmentResource(appointment),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/appointments
 * Admin only -> list all appointments.
 * (Doctor and Patient already have dedicated list endpoints.)
 */
export const getAppointments = async (req, res, next) => {
  try {
    if (normalizeRole(req.user.role) !== "admin") {
      return res.status(403).json({ message: "Not authorized to list all appointments" });
    }

    const { status, date } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) filter.date = date;

    const appointments = await Appointment.find(filter).sort({ date: 1, time: 1 });

    res.status(200).json({
      appointments: appointments.map((a) => ({
        ...appointmentResource(a),
        doctorName: a.doctor,
        patientName: a.patient,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/appointments/:id
 * Admin -> any appointment
 * Doctor -> own appointments
 * Patient -> own appointments
 */
export const getAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("doctor")
      .populate("patient");
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const role = normalizeRole(req.user.role);

    if (role === "doctor") {
      const profile = await DoctorProfile.findOne({ user: req.user._id });
      if (!profile || appointment.doctor._id.toString() !== profile._id.toString()) {
        return res.status(403).json({ message: "Not authorized to access this appointment" });
      }
    }

    if (role === "patient") {
      const patient = await Patient.findOne({ user: req.user._id });
      if (!patient || appointment.patient._id.toString() !== patient._id.toString()) {
        return res.status(403).json({ message: "Not authorized to access this appointment" });
      }
    }

    res.status(200).json({ appointment: appointmentResource(appointment) });
  } catch (error) {
    next(error);
  }
};

const VALID_STATUSES = ["Scheduled", "Waiting", "In Consultation", "Completed", "Cancelled"];

/**
 * PATCH /api/appointments/:id/status
 * Admin -> any appointment
 * Doctor -> own appointments (e.g. Cancelled, Completed, In Consultation)
 */
export const updateAppointmentStatus = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const nextStatus = req.body.status;
    if (!VALID_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid appointment status" });
    }

    const role = normalizeRole(req.user.role);
    if (role === "doctor") {
      const profile = await DoctorProfile.findOne({ user: req.user._id });
      if (!profile || appointment.doctor.toString() !== profile._id.toString()) {
        return res.status(403).json({ message: "Not authorized to update this appointment" });
      }
    } else if (role !== "admin") {
      return res.status(403).json({ message: "Not authorized to update appointment status" });
    }

    appointment.status = nextStatus;
    await appointment.save();

    res.status(200).json({
      message: "Appointment status updated",
      appointment: appointmentResource(appointment),
    });
  } catch (error) {
    next(error);
  }
};