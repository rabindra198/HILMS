const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const ROLES = require("../constants/roles");
const { validateUpdateRequestStatus, validateCreateLabReport } = require("../validations/laboratory.validation");

const {
  getLaboratoryDashboard,
  getPendingRequests,
  updateLabRequestStatus,
  getLabTests,
  getLabReports,
  createLabReport,
} = require("../controllers/laboratory.controller");

router.use(protect, authorize(ROLES.LABORATORY));

router.get("/dashboard", getLaboratoryDashboard);
router.get("/requests", getPendingRequests);
router.patch("/requests/:id/status", validateUpdateRequestStatus, updateLabRequestStatus);
router.get("/tests", getLabTests);
router.get("/reports", getLabReports);
router.post("/reports", validateCreateLabReport, createLabReport);

module.exports = router;