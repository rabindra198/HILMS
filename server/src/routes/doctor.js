import express from "express";
import {
  getDashboard,
  getAppointments,
  getPatients,
  getConsultations,
  getConsultation,
  getConsultationByAppointment,
  createConsultation,
  getPrescriptions,
  createPrescription,
  getPrescriptionPdf,
  requestLabTest,
  getLabRequests,
  getLabReports,
  getLabReport,
  addReportComment,
  continueTreatment,
  getFollowUps,
  createFollowUp,
  getProfile,
  updateProfile,
  getLabTests,
  getSettings,
  updateSettings,
  getNotifications,
} from "../controllers/doctorController.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("doctor"));

router.get("/", (req, res) => res.status(200).json({ message: "Doctor API is running" }));
router.get("/lab-tests", getLabTests);
router.get("/dashboard", getDashboard);
router.get("/appointments", getAppointments);
router.get("/patients", getPatients);
router.get("/consultations", getConsultations);
router.get("/consultations/:id", getConsultation);
router.get("/consultations/appointment/:appointmentId", getConsultationByAppointment);
router.post("/consultations", createConsultation);
router.put("/consultations/:id", createConsultation);
router.get("/prescriptions", getPrescriptions);
router.post("/prescriptions", createPrescription);
router.get("/prescriptions/:id/pdf", getPrescriptionPdf);
router.get("/lab-requests", getLabRequests);
router.post("/lab-requests", requestLabTest);
router.get("/lab-reports", getLabReports);
router.get("/lab-reports/:id", getLabReport);
router.post("/lab-reports/:id/comments", addReportComment);
router.post("/lab-reports/:id/treatment", continueTreatment);
router.get("/follow-ups", getFollowUps);
router.post("/follow-ups", createFollowUp);
router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.get("/settings", getSettings);
router.put("/settings", updateSettings);
router.get("/notifications", getNotifications);

export default router;
