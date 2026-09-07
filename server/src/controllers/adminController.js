import User from "../models/User.js";
import DoctorProfile from "../models/DoctorProfile.js";
import Patient from "../models/Patient.js";
import Appointment from "../models/Appointment.js";
import Consultation from "../models/Consultation.js";
import LabRequest from "../models/LabRequest.js";
import LabReport from "../models/LabReport.js";
import FollowUp from "../models/FollowUp.js";
import { normalizeRole } from "../config/roles.js";

export const getAdminDashboard = async (req, res) => {
  try {
    const [totalUsers, totalDoctors, totalPatients, totalAppointments, pendingLabRequests, completedConsultations] =
      await Promise.all([
        User.countDocuments({}),
        DoctorProfile.countDocuments({}),
        Patient.countDocuments({}),
        Appointment.countDocuments({}),
        LabRequest.countDocuments({ status: { $in: ["Pending", "In Progress"] } }),
        Consultation.countDocuments({ status: "Completed" }),
      ]);

    res.status(200).json({
      totalUsers,
      totalDoctors,
      totalPatients,
      totalAppointments,
      pendingLabRequests,
      completedConsultations,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("-password");
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = normalizeRole(req.body.role);
    await user.save();

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot delete yourself" });
    }

    await user.deleteOne();
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
