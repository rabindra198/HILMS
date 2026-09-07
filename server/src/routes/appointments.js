import express from "express";
import { verifyToken } from "../middleware/auth.js";
import {
  createAppointment,
  getAppointments,
  getAppointment,
  updateAppointmentStatus,
} from "../controllers/appointmentsController.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getAppointments);

router.post("/", createAppointment);

router.get("/:id", getAppointment);

router.patch("/:id/status", updateAppointmentStatus);

export default router;