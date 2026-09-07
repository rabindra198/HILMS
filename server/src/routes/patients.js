import express from "express";
import { verifyToken, requireRole } from "../middleware/auth.js";
import {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient,
} from "../controllers/patientResourceController.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", listPatients);

router.post("/", requireRole("admin"), createPatient);

router.get("/:id", getPatient);

router.put("/:id", requireRole("admin"), updatePatient);

router.delete("/:id", requireRole("admin"), deletePatient);

export default router;