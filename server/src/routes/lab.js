import express from "express";
import { verifyToken, requireRole } from "../middleware/auth.js";
import {
  getLabRequests,
  updateLabRequestStatus,
  createLabReport,
  getLabReports,
  getLabReportDetail,
} from "../controllers/labController.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("lab"));

router.get("/requests", getLabRequests);
router.patch("/requests/:id/status", updateLabRequestStatus);
router.post("/reports", createLabReport);
router.get("/reports", getLabReports);
router.get("/reports/:id", getLabReportDetail);

export default router;
