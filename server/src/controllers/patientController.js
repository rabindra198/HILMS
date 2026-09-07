import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import Consultation from "../models/Consultation.js";
import Prescription from "../models/Prescription.js";
import LabReport from "../models/LabReport.js";
import FollowUp from "../models/FollowUp.js";

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

const patientResource = (p) => {
  if (!p) return null;
  return {
    id: idOf(p._id || p.id),
    patientId: p.patientId,
    name: p.name,
    age: p.age,
    gender: p.gender,
    bloodGroup: p.bloodGroup,
    phone: p.phone,
    email: p.email,
    address: p.address,
    allergies: p.allergies || [],
    conditions: p.conditions || [],
    createdAt: p.createdAt || null,
  };
};

export const getPatientProfile = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) {
      return res.status(404).json({ message: "Patient profile not found" });
    }
    res.status(200).json({ patient: patientResource(patient) });
  } catch (error) {
    next(error);
  }
};

export const getPatientAppointments = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const appointments = await Appointment.find({ patient: patient._id })
      .populate("doctor")
      .sort({ date: 1, time: 1 });

    res.status(200).json({
      appointments: appointments.map((a) => ({
        id: idOf(a._id),
        doctor: a.doctor,
        date: a.date,
        time: a.time,
        type: a.type,
        status: a.status,
        notes: a.notes,
        createdAt: a.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientConsultations = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const consultations = await Consultation.find({ patient: patient._id })
      .populate("doctor")
      .sort({ createdAt: -1 });

    res.status(200).json({
      consultations: consultations.map((c) => ({
        id: idOf(c._id),
        doctor: c.doctor,
        appointment: idOf(c.appointment),
        chiefComplaint: c.chiefComplaint,
        clinicalNotes: c.clinicalNotes,
        diagnosis: c.diagnosis,
        treatmentPlan: c.treatmentPlan,
        additionalNotes: c.additionalNotes,
        vitalSigns: c.vitalSigns || {},
        status: c.status,
        createdAt: c.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientPrescriptions = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const prescriptions = await Prescription.find({ patient: patient._id })
      .populate("doctor")
      .sort({ createdAt: -1 });

    res.status(200).json({
      prescriptions: prescriptions.map((rx) => ({
        id: idOf(rx._id),
        doctor: rx.doctor,
        diagnosis: rx.diagnosis,
        medicines: rx.medicines || [],
        notes: rx.notes,
        followUpDate: rx.followUpDate,
        createdAt: rx.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientLabReports = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const reports = await LabReport.find({ patient: patient._id })
      .populate("doctor")
      .sort({ createdAt: -1 });

    res.status(200).json({
      reports: reports.map((r) => ({
        id: idOf(r._id),
        doctor: r.doctor,
        testName: r.testName,
        requestedDate: r.requestedDate,
        completedDate: r.completedDate,
        results: r.results || [],
        status: r.status,
        comment: r.comment,
        reviewed: r.reviewed,
        createdAt: r.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getPatientFollowUps = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) {
      return res.status(404).json({ message: "Patient profile not found" });
    }

    const followUps = await FollowUp.find({ patient: patient._id })
      .populate("doctor")
      .sort({ date: 1 });

    res.status(200).json({
      followUps: followUps.map((f) => ({
        id: idOf(f._id),
        doctor: f.doctor,
        date: f.date,
        time: f.time,
        reason: f.reason,
        notes: f.notes,
        status: f.status,
        createdAt: f.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};
