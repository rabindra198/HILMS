import User from "../models/User.js";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import DoctorProfile from "../models/DoctorProfile.js";
import { normalizeRole } from "../config/roles.js";

const idOf = (value) => {
  if (!value) return undefined;
  return typeof value.toString === "function" ? value.toString() : value;
};

export const patientResource = (p) => {
  if (!p) return null;
  return {
    id: idOf(p._id || p.id),
    user: idOf(p.user),
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

const getDoctorProfileId = async (userId) => {
  if (!userId) return null;
  let profile = await DoctorProfile.findOne({ user: userId });
  if (!profile) {
    profile = await DoctorProfile.create({ user: userId });
  }
  return profile;
};

const isPatientVisibleToDoctor = async (doctorProfileId, patientId) => {
  const appointment = await Appointment.findOne({
    doctor: doctorProfileId,
    patient: patientId,
  });
  return Boolean(appointment);
};

/**
 * GET /api/patients
 * Admin   -> all patients
 * Doctor  -> patients seen in their own appointments
 * Patient -> own patient profile only
 */
export const listPatients = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user.role);
    const { search } = req.query;

    let patients = [];
    if (role === "admin") {
      patients = await Patient.find({}).sort({ createdAt: -1 });
    } else if (role === "doctor") {
      const profile = await getDoctorProfileId(req.user._id);
      const patientIds = await Appointment.find({ doctor: profile._id }).distinct("patient");
      patients = await Patient.find({ _id: { $in: patientIds } });
    } else if (role === "patient") {
      const own = await Patient.findOne({ user: req.user._id });
      patients = own ? [own] : [];
    }

    if (search) {
      const term = search.toLowerCase();
      patients = patients.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(term) ||
          (p.patientId || "").toLowerCase().includes(term) ||
          (p.phone || "").toLowerCase().includes(term) ||
          (p.email || "").toLowerCase().includes(term)
      );
    }

    res.status(200).json({ patients: patients.map(patientResource) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/patients
 * Admin only. Creates a Patient profile and links it to a User
 * so the patient can log in.
 */
export const createPatient = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      age,
      gender,
      bloodGroup,
      address,
      allergies,
      conditions,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Patient name is required" });
    }

    let user = null;
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";

    if (normalizedEmail) {
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(409).json({ message: "User already exists with this email" });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters when an email is provided" });
      }
      user = await User.create({
        name,
        email: normalizedEmail,
        password,
        phone: phone || "",
        role: "patient",
      });
    }

    const patient = await Patient.create({
      user: user ? user._id : undefined,
      name,
      age,
      gender,
      bloodGroup,
      phone,
      email: normalizedEmail || undefined,
      address,
      allergies: allergies || [],
      conditions: conditions || [],
    });

    res.status(201).json({
      message: user
        ? "Patient registered successfully. A login account was created."
        : "Patient registered successfully",
      patient: patientResource(patient),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/patients/:id
 * Admin -> any patient
 * Doctor -> only patients they have appointments with
 * Patient -> only their own profile
 */
export const getPatient = async (req, res, next) => {
  try {
    const role = normalizeRole(req.user.role);
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    if (role === "patient") {
      const own = await Patient.findOne({ user: req.user._id });
      if (!own || own._id.toString() !== patient._id.toString()) {
        return res.status(403).json({ message: "Not authorized to access this patient" });
      }
    }

    if (role === "doctor") {
      const profile = await getDoctorProfileId(req.user._id);
      const visible = await isPatientVisibleToDoctor(profile._id, patient._id);
      if (!visible) {
        return res.status(403).json({ message: "Not authorized to access this patient" });
      }
    }

    res.status(200).json({ patient: patientResource(patient) });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/patients/:id
 * Admin only.
 */
export const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const updatable = [
      "name",
      "age",
      "gender",
      "bloodGroup",
      "phone",
      "email",
      "address",
      "allergies",
      "conditions",
    ];
    for (const field of updatable) {
      if (req.body[field] !== undefined) patient[field] = req.body[field];
    }

    if (patient.user) {
      const user = await User.findById(patient.user);
      if (user) {
        if (req.body.name) user.name = req.body.name;
        if (req.body.phone !== undefined) user.phone = req.body.phone;
        if (req.body.email !== undefined && req.body.email !== user.email) {
          const exists = await User.findOne({ email: req.body.email, _id: { $ne: user._id } });
          if (exists) {
            return res.status(409).json({ message: "User already exists with this email" });
          }
          user.email = req.body.email;
        }
        await user.save();
        if (req.body.email) patient.email = user.email;
      }
    }

    await patient.save();

    res.status(200).json({
      message: "Patient updated successfully",
      patient: patientResource(patient),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/patients/:id
 * Admin only.
 */
export const deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    if (patient.user) {
      await User.findByIdAndDelete(patient.user);
    }
    await patient.deleteOne();

    res.status(200).json({ message: "Patient deleted successfully" });
  } catch (error) {
    next(error);
  }
};