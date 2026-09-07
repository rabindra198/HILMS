import mongoose from "mongoose";
import User from "../models/User.js";
import DoctorProfile from "../models/DoctorProfile.js";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import Consultation from "../models/Consultation.js";
import Prescription from "../models/Prescription.js";
import LabRequest from "../models/LabRequest.js";
import LabReport from "../models/LabReport.js";
import FollowUp from "../models/FollowUp.js";
import { LAB_TESTS } from "../models/LabRequest.js";
import { generatePrescriptionPdf } from "../utils/pdfGenerator.js";

export const getLabTests = (req, res) => {
  res.status(200).json({ tests: LAB_TESTS });
};

const getDoctorProfile = async (userId) => {
  if (!userId) return null;
  let profile = await DoctorProfile.findOne({ user: userId });
  if (!profile) {
    profile = await DoctorProfile.create({ user: userId });
  }
  return profile;
};

const requireOwnership = async (req, doctorProfileId, resourceModel, resourceId, resourceField = "doctor") => {
  const resource = await resourceModel.findById(resourceId);
  if (!resource) return null;
  const ownerId = resource[resourceField];
  if (ownerId && ownerId.toString() !== doctorProfileId.toString()) {
    return "forbidden";
  }
  return resource;
};

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

const doctorProfileResource = (d) => {
  if (!d) return null;
  return {
    id: idOf(d._id || d.id),
    user: idOf(d.user),
    specialization: d.specialization,
    licenseNumber: d.licenseNumber,
    department: d.department,
    workingHours: d.workingHours || { start: "09:00", end: "17:00" },
    bio: d.bio,
    avatar: d.avatar,
  };
};

const appointmentResource = (a, patient, doctor) => ({
  id: idOf(a._id || a.id),
  patient: patient ? patientResource(patient) : a.patient,
  doctor: doctor ? doctorProfileResource(doctor) : a.doctor,
  date: a.date,
  time: a.time,
  type: a.type,
  status: a.status,
  notes: a.notes,
  createdAt: a.createdAt || null,
});

const consultationResource = (c, patient, doctor) => ({
  id: idOf(c._id || c.id),
  appointment: idOf(c.appointment),
  doctor: doctor ? doctorProfileResource(doctor) : c.doctor,
  patient: patient ? patientResource(patient) : c.patient,
  chiefComplaint: c.chiefComplaint,
  clinicalNotes: c.clinicalNotes,
  diagnosis: c.diagnosis,
  treatmentPlan: c.treatmentPlan,
  additionalNotes: c.additionalNotes,
  vitalSigns: c.vitalSigns || {},
  status: c.status,
  followUp: c.followUp || { date: "", time: "", reason: "", notes: "" },
  createdAt: c.createdAt || null,
  updatedAt: c.updatedAt || null,
});

export const getDashboard = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);

    const today = new Date().toISOString().slice(0, 10);
    const [appointments, pendingLabRequests, followUps, completedConsultations] =
      await Promise.all([
        Appointment.countDocuments({
          doctor: profile._id,
          date: today,
          status: { $nin: ["Cancelled"] },
        }),
        LabRequest.countDocuments({
          doctor: profile._id,
          status: { $in: ["Pending", "In Progress"] },
        }),
        FollowUp.countDocuments({
          doctor: profile._id,
          status: "Upcoming",
        }),
        Consultation.countDocuments({
          doctor: profile._id,
          status: "Completed",
        }),
      ]);

    const todayAppointments = await Appointment.find({
      doctor: profile._id,
      date: today,
    })
      .populate("patient")
      .populate("doctor")
      .sort({ time: 1 });

    res.status(200).json({
      stats: {
        todayAppointments: appointments,
        pendingLabReports: pendingLabRequests,
        followUpPatients: followUps,
        completedToday: completedConsultations,
      },
      appointments: todayAppointments.map((a) =>
        appointmentResource(a, a.patient, a.doctor)
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const getAppointments = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const { status } = req.query;
    const filter = { doctor: profile._id };
    if (status) filter.status = status;

    const appointments = await Appointment.find(filter)
      .populate("patient")
      .populate("doctor")
      .sort({ date: 1, time: 1 });

    res.status(200).json({
      appointments: appointments.map((a) =>
        appointmentResource(a, a.patient, a.doctor)
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const getPatients = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const appointments = await Appointment.find({ doctor: profile._id })
      .distinct("patient");
    const { search } = req.query;

    let patients = await Patient.find({ _id: { $in: appointments } });
    if (search) {
      const term = search.toLowerCase();
      patients = patients.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(term) ||
          (p.patientId || "").toLowerCase().includes(term) ||
          (p.phone || "").toLowerCase().includes(term)
      );
    }

    res.status(200).json({ patients: patients.map(patientResource) });
  } catch (error) {
    next(error);
  }
};

export const getConsultations = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const consultations = await Consultation.find({ doctor: profile._id })
      .populate("patient")
      .sort({ createdAt: -1 });

    res.status(200).json({
      consultations: consultations.map((c) =>
        consultationResource(c, c.patient, null)
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const getConsultationByAppointment = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const appointment = await Appointment.findById(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    if (appointment.doctor.toString() !== profile._id.toString()) {
      return res.status(403).json({ message: "Not authorized to access this appointment" });
    }

    const consultation = await Consultation.findOne({ appointment: appointment._id })
      .populate("patient")
      .populate("doctor");
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found for this appointment" });
    }

    const patient = consultation.patient;

    const [history, prescriptions, labReports, followUps] = await Promise.all([
      Consultation.find({ patient: patient._id })
        .populate("patient")
        .sort({ createdAt: -1 }),
      Prescription.find({ patient: patient._id }).populate("patient").sort({ createdAt: -1 }),
      LabReport.find({ patient: patient._id }).populate("patient").sort({ createdAt: -1 }),
      FollowUp.find({ patient: patient._id }).sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      consultation: consultationResource(consultation, consultation.patient, consultation.doctor),
      patient: patientResource(patient),
      medicalHistory: history.map((c) => consultationResource(c, c.patient, null)),
      prescriptions: prescriptions.map((rx) => ({
        id: idOf(rx._id),
        patient: rx.patient ? patientResource(rx.patient) : null,
        diagnosis: rx.diagnosis,
        medicines: rx.medicines || [],
        notes: rx.notes,
        followUpDate: rx.followUpDate,
        createdAt: rx.createdAt || null,
      })),
      labReports: labReports.map((r) => ({
        id: idOf(r._id),
        testName: r.testName,
        results: r.results || [],
        status: r.status,
        completedDate: r.completedDate,
        createdAt: r.createdAt || null,
      })),
      followUps: followUps.map((f) => ({
        id: idOf(f._id),
        date: f.date,
        time: f.time,
        reason: f.reason,
        status: f.status,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getConsultation = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const consultation = await Consultation.findById(req.params.id)
      .populate("patient")
      .populate("doctor");
    if (!consultation) {
      return res.status(404).json({ message: "Consultation not found" });
    }
    if (consultation.doctor && consultation.doctor._id.toString() !== profile._id.toString()) {
      return res.status(403).json({ message: "Not authorized to access this consultation" });
    }
    const patient = consultation.patient;

    const [history, prescriptions, labReports, followUps] = await Promise.all([
      Consultation.find({ patient: patient._id })
        .populate("patient")
        .sort({ createdAt: -1 }),
      Prescription.find({ patient: patient._id }).populate("patient").sort({ createdAt: -1 }),
      LabReport.find({ patient: patient._id }).populate("patient").sort({ createdAt: -1 }),
      FollowUp.find({ patient: patient._id }).sort({ createdAt: -1 }),
    ]);

    res.status(200).json({
      consultation: consultationResource(consultation, consultation.patient, consultation.doctor),
      patient: patientResource(patient),
      medicalHistory: history.map((c) => consultationResource(c, c.patient, null)),
      prescriptions: prescriptions.map((rx) => ({
        id: idOf(rx._id),
        patient: rx.patient ? patientResource(rx.patient) : null,
        diagnosis: rx.diagnosis,
        medicines: rx.medicines || [],
        notes: rx.notes,
        followUpDate: rx.followUpDate,
        createdAt: rx.createdAt || null,
      })),
      labReports: labReports.map((r) => ({
        id: idOf(r._id),
        testName: r.testName,
        results: r.results || [],
        status: r.status,
        completedDate: r.completedDate,
        createdAt: r.createdAt || null,
      })),
      followUps: followUps.map((f) => ({
        id: idOf(f._id),
        date: f.date,
        time: f.time,
        reason: f.reason,
        status: f.status,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const createConsultation = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const {
      appointment: appointmentId,
      patient: patientId,
      chiefComplaint,
      clinicalNotes,
      diagnosis,
      treatmentPlan,
      additionalNotes,
      vitalSigns,
      status,
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "Patient is required" });
    }

    let consultation;
    if (req.params.id) {
      consultation = await Consultation.findById(req.params.id);
      if (!consultation) {
        return res.status(404).json({ message: "Consultation not found" });
      }
      if (consultation.doctor.toString() !== profile._id.toString()) {
        return res.status(403).json({ message: "Not authorized to update this consultation" });
      }
      consultation.set({
        chiefComplaint,
        clinicalNotes,
        diagnosis,
        treatmentPlan,
        additionalNotes,
        vitalSigns,
        status: status || consultation.status,
      });
      await consultation.save();
    } else {
      if (appointmentId) {
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
          return res.status(404).json({ message: "Appointment not found" });
        }
        if (appointment.doctor.toString() !== profile._id.toString()) {
          return res.status(403).json({ message: "Not authorized to create consultation for this appointment" });
        }
      }
      consultation = await Consultation.create({
        appointment: appointmentId,
        doctor: profile._id,
        patient: patientId,
        chiefComplaint,
        clinicalNotes,
        diagnosis,
        treatmentPlan,
        additionalNotes,
        vitalSigns,
        status: status || "Draft",
      });
    }

    if (appointmentId && status === "Completed") {
      await Appointment.findByIdAndUpdate(appointmentId, { status: "Completed" });
    }

    res.status(201).json({
      message: status === "Completed"
        ? "Consultation completed successfully"
        : "Consultation saved successfully",
      consultation,
    });
  } catch (error) {
    next(error);
  }
};

export const getPrescriptions = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const prescriptions = await Prescription.find({ doctor: profile._id })
      .populate("patient")
      .sort({ createdAt: -1 });

    res.status(200).json({
      prescriptions: prescriptions.map((rx) => ({
        id: idOf(rx._id),
        consultation: idOf(rx.consultation),
        patient: rx.patient ? patientResource(rx.patient) : null,
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

export const getPrescriptionPdf = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const prescription = await Prescription.findById(req.params.id)
      .populate({ path: "doctor", populate: { path: "user" } })
      .populate("patient");
    if (!prescription) {
      return res.status(404).json({ message: "Prescription not found" });
    }
    if (prescription.doctor._id.toString() !== profile._id.toString()) {
      return res.status(403).json({ message: "Not authorized to access this prescription" });
    }

    const pdfBuffer = await generatePrescriptionPdf(prescription);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="prescription-${prescription._id}.pdf"`);
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

export const createPrescription = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const {
      consultation: consultationId,
      patient: patientId,
      diagnosis,
      medicines,
      notes,
      followUpDate,
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "Patient is required" });
    }
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ message: "At least one medicine is required" });
    }
    for (const med of medicines) {
      if (!med.name || !med.dosage || !med.frequency || !med.duration) {
        return res
          .status(400)
          .json({ message: "Each medicine requires name, dosage, frequency and duration" });
      }
    }

    if (consultationId) {
      const consultation = await Consultation.findById(consultationId);
      if (!consultation) {
        return res.status(404).json({ message: "Consultation not found" });
      }
      if (consultation.doctor.toString() !== profile._id.toString()) {
        return res.status(403).json({ message: "Not authorized to create prescription for this consultation" });
      }
    }

    const prescription = await Prescription.create({
      consultation: consultationId,
      doctor: profile._id,
      patient: patientId,
      diagnosis,
      medicines,
      notes,
      followUpDate,
    });

    res.status(201).json({
      message: "Prescription created successfully",
      prescription: {
        id: idOf(prescription._id),
        patient: patientId,
        diagnosis,
        medicines,
        notes,
        followUpDate,
        createdAt: prescription.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const requestLabTest = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const {
      patient: patientId,
      appointment: appointmentId,
      testName,
      clinicalNotes,
      priority,
    } = req.body;

    if (!patientId || !testName) {
      return res.status(400).json({ message: "Patient and test are required" });
    }
    if (!LAB_TESTS.includes(testName)) {
      return res.status(400).json({ message: "Test must be from the predefined list" });
    }

    const PRIORITY_MAP = { normal: "Normal", urgent: "Urgent", emergency: "Emergency" };
    const normalizedPriority = PRIORITY_MAP[String(priority || "normal").toLowerCase()];
    if (!normalizedPriority) {
      return res.status(400).json({ message: "Priority must be normal, urgent or emergency" });
    }

    if (appointmentId) {
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      if (appointment.doctor.toString() !== profile._id.toString()) {
        return res.status(403).json({ message: "Not authorized to request lab test for this appointment" });
      }
    }

    const request = await LabRequest.create({
      doctor: profile._id,
      patient: patientId,
      appointment: appointmentId,
      testName,
      clinicalNotes: clinicalNotes || "",
      priority: normalizedPriority,
      requestedDate: new Date().toISOString().slice(0, 10),
      status: "Pending",
    });

    res.status(201).json({
      message: "Laboratory test requested successfully",
      request: {
        id: idOf(request._id),
        patient: patientId,
        testName,
        priority: normalizedPriority,
        status: request.status,
        requestedDate: request.requestedDate,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLabRequests = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const requests = await LabRequest.find({ doctor: profile._id })
      .populate("patient")
      .sort({ createdAt: -1 });

    res.status(200).json({
      requests: requests.map((r) => ({
        id: idOf(r._id),
        patient: r.patient ? patientResource(r.patient) : null,
        testName: r.testName,
        requestedDate: r.requestedDate,
        priority: r.priority,
        status: r.status,
        clinicalNotes: r.clinicalNotes,
      })),
      tests: LAB_TESTS,
    });
  } catch (error) {
    next(error);
  }
};

export const getLabReports = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const reports = await LabReport.find({ doctor: profile._id })
      .populate("patient")
      .sort({ createdAt: -1 });

    res.status(200).json({
      reports: reports.map((r) => ({
        id: idOf(r._id),
        patient: r.patient ? patientResource(r.patient) : null,
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

export const getLabReport = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const report = await LabReport.findById(req.params.id).populate("patient");
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    if (report.doctor.toString() !== profile._id.toString()) {
      return res.status(403).json({ message: "Not authorized to access this report" });
    }

    const previousReports = await LabReport.find({
      patient: report.patient._id,
      testName: report.testName,
      _id: { $ne: report._id },
    })
      .populate("patient")
      .sort({ createdAt: -1 });

    res.status(200).json({
      report: {
        id: idOf(report._id),
        patient: report.patient ? patientResource(report.patient) : null,
        testName: report.testName,
        requestedDate: report.requestedDate,
        completedDate: report.completedDate,
        results: report.results || [],
        status: report.status,
        comment: report.comment,
        reviewed: report.reviewed,
        treatment: report.treatment || {},
        createdAt: report.createdAt || null,
      },
      previousReports: previousReports.map((r) => ({
        id: idOf(r._id),
        testName: r.testName,
        completedDate: r.completedDate,
        results: r.results || [],
        createdAt: r.createdAt || null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const addReportComment = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const report = await LabReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    if (report.doctor.toString() !== profile._id.toString()) {
      return res.status(403).json({ message: "Not authorized to comment on this report" });
    }
    report.comment = req.body.comment || "";
    report.reviewed = true;
    await report.save();

    res.status(200).json({
      message: "Comment saved successfully",
      report: {
        id: idOf(report._id),
        comment: report.comment,
        reviewed: report.reviewed,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const continueTreatment = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const report = await LabReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    if (report.doctor.toString() !== profile._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update treatment for this report" });
    }
    report.treatment = {
      clinicalInterpretation: req.body.clinicalInterpretation || "",
      treatmentDecision: req.body.treatmentDecision || "",
      updatedDiagnosis: req.body.updatedDiagnosis || "",
      additionalMedication: req.body.additionalMedication || "",
      additionalNotes: req.body.additionalNotes || "",
    };
    report.reviewed = true;
    await report.save();

    res.status(200).json({
      message: "Treatment updated successfully",
      report: {
        id: idOf(report._id),
        treatment: report.treatment,
        reviewed: report.reviewed,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getFollowUps = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const followUps = await FollowUp.find({ doctor: profile._id })
      .populate("patient")
      .populate("consultation")
      .sort({ date: 1 });

    res.status(200).json({
      followUps: followUps.map((f) => ({
        id: idOf(f._id),
        patient: f.patient ? patientResource(f.patient) : null,
        consultation: f.consultation ? consultationResource(f.consultation, null, null) : null,
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

export const createFollowUp = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const {
      patient: patientId,
      consultation: consultationId,
      date,
      time,
      reason,
      notes,
    } = req.body;

    if (!patientId || !date) {
      return res.status(400).json({ message: "Patient and date are required" });
    }

    const hasAccess = await Appointment.findOne({
      doctor: profile._id,
      patient: patientId,
    });
    if (!hasAccess) {
      return res.status(403).json({ message: "Not authorized to create follow-up for this patient" });
    }

    const followUp = await FollowUp.create({
      doctor: profile._id,
      patient: patientId,
      consultation: consultationId,
      date,
      time: time || "",
      reason: reason || "",
      notes: notes || "",
      status: "Upcoming",
    });

    res.status(201).json({
      message: "Follow-up scheduled successfully",
      followUp: {
        id: idOf(followUp._id),
        date: followUp.date,
        time: followUp.time,
        reason: followUp.reason,
        status: followUp.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const profile = await getDoctorProfile(req.user._id);

    res.status(200).json({
      user: {
        id: idOf(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
      },
      profile: doctorProfileResource(profile),
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone !== undefined) user.phone = req.body.phone;
    await user.save();

    const profile = await getDoctorProfile(req.user._id);
    if (!profile) {
      return res.status(404).json({ message: "Doctor profile not found" });
    }
    profile.specialization = req.body.specialization !== undefined ? req.body.specialization : profile.specialization;
    profile.licenseNumber = req.body.licenseNumber !== undefined ? req.body.licenseNumber : profile.licenseNumber;
    profile.department = req.body.department !== undefined ? req.body.department : profile.department;
    profile.bio = req.body.bio !== undefined ? req.body.bio : profile.bio;
    if (req.body.workingHours) profile.workingHours = req.body.workingHours;
    await profile.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: idOf(user._id),
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
      },
      profile: doctorProfileResource(profile),
    });
  } catch (error) {
    next(error);
  }
};

export const getSettings = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const settings = profile.settings || {};

    res.status(200).json({
      settings: {
        notifications: {
          appointmentReminders: settings.notifications?.appointmentReminders ?? true,
          labReportAlerts: settings.notifications?.labReportAlerts ?? true,
          followUpReminders: settings.notifications?.followUpReminders ?? true,
          newPatientAlerts: settings.notifications?.newPatientAlerts ?? false,
          systemMaintenance: settings.notifications?.systemMaintenance ?? true,
        },
        clinical: {
          consultationDuration: settings.clinical?.consultationDuration || "30 minutes",
          followUpPeriod: settings.clinical?.followUpPeriod || "2 weeks",
          labReportPriority: settings.clinical?.labReportPriority || "Normal",
          prescriptionTemplate: settings.clinical?.prescriptionTemplate || "Standard",
        },
        theme: settings.theme || "Light",
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const { notifications, clinical, theme } = req.body;

    if (notifications && typeof notifications === "object") {
      profile.settings.notifications = {
        ...(profile.settings.notifications || {}),
        ...notifications,
      };
    }

    if (clinical && typeof clinical === "object") {
      profile.settings.clinical = {
        ...(profile.settings.clinical || {}),
        ...clinical,
      };
    }

    if (theme !== undefined) profile.settings.theme = theme;

    await profile.save();

    const settings = profile.settings || {};
    res.status(200).json({
      message: "Settings updated successfully",
      settings: {
        notifications: {
          appointmentReminders: settings.notifications?.appointmentReminders ?? true,
          labReportAlerts: settings.notifications?.labReportAlerts ?? true,
          followUpReminders: settings.notifications?.followUpReminders ?? true,
          newPatientAlerts: settings.notifications?.newPatientAlerts ?? false,
          systemMaintenance: settings.notifications?.systemMaintenance ?? true,
        },
        clinical: {
          consultationDuration: settings.clinical?.consultationDuration || "30 minutes",
          followUpPeriod: settings.clinical?.followUpPeriod || "2 weeks",
          labReportPriority: settings.clinical?.labReportPriority || "Normal",
          prescriptionTemplate: settings.clinical?.prescriptionTemplate || "Standard",
        },
        theme: settings.theme || "Light",
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getNotifications = async (req, res, next) => {
  try {
    const profile = await getDoctorProfile(req.user._id);
    const today = new Date().toISOString().slice(0, 10);
    const settings = profile.settings?.notifications || {};

    const [
      todayAppointments,
      pendingLabRequests,
      followUps,
      completedConsultations,
    ] = await Promise.all([
      Appointment.find({
        doctor: profile._id,
        date: today,
        status: { $nin: ["Cancelled", "Completed"] },
      })
        .populate("patient")
        .sort({ time: 1 }),
      LabRequest.find({
        doctor: profile._id,
        status: { $in: ["Pending", "In Progress"] },
      })
        .populate("patient")
        .sort({ createdAt: -1 }),
      FollowUp.find({
        doctor: profile._id,
        status: "Upcoming",
      })
        .populate("patient")
        .sort({ date: 1 }),
      Consultation.countDocuments({ doctor: profile._id, status: "Completed" }),
    ]);

    const notifications = [];

    if (settings.appointmentReminders !== false) {
      todayAppointments.forEach((a) => {
        notifications.push({
          id: `apt-${idOf(a._id)}`,
          type: "appointment",
          title: "Upcoming appointment",
          description: `${a.patient?.name || "Patient"} scheduled at ${a.time} (${a.type || "Consultation"})`,
          time: `${a.date} ${a.time}`,
          read: false,
        });
      });
    }

    if (settings.labReportAlerts !== false) {
      pendingLabRequests.forEach((r) => {
        notifications.push({
          id: `lab-${idOf(r._id)}`,
          type: "lab",
          title: "Lab report pending",
          description: `${r.testName} for ${r.patient?.name || "Patient"} (${r.priority || "Normal"})`,
          time: r.createdAt ? new Date(r.createdAt).toISOString() : "",
          read: false,
        });
      });
    }

    if (settings.followUpReminders !== false) {
      followUps.forEach((f) => {
        notifications.push({
          id: `fu-${idOf(f._id)}`,
          type: "followup",
          title: "Follow-up scheduled",
          description: `${f.patient?.name || "Patient"} — ${f.reason || "Follow-up"} on ${f.date}${f.time ? " at " + f.time : ""}`,
          time: `${f.date} ${f.time || ""}`,
          read: false,
        });
      });
    }

    const updatedDate = new Date();
    if (settings.appointmentReminders !== false) {
      notifications.push({
        id: "summary-appointments",
        type: "summary",
        title: `${completedConsultations} consultation${completedConsultations === 1 ? "" : "s"} completed`,
        description: "You have completed consultations today.",
        time: updatedDate.toISOString(),
        read: false,
      });
    }

    notifications.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    });

    const unread = todayAppointments.length + pendingLabRequests.length + followUps.length;

    res.status(200).json({
      notifications,
      unreadCount: unread,
    });
  } catch (error) {
    next(error);
  }
};
