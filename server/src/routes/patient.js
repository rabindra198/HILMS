import express from "express";
import { verifyToken, requireRole } from "../middleware/auth.js";
import {
  getPatientProfile,
  getPatientAppointments,
  getPatientConsultations,
  getPatientPrescriptions,
  getPatientLabReports,
  getPatientFollowUps,
} from "../controllers/patientController.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("patient"));

router.get("/profile", getPatientProfile);
router.get("/appointments", getPatientAppointments);
router.get("/consultations", getPatientConsultations);
router.get("/prescriptions", getPatientPrescriptions);
router.get("/lab-reports", getPatientLabReports);
router.get("/follow-ups", getPatientFollowUps);

export default router;
