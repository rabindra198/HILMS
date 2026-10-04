const express = require("express");
const { protect, blockUntilPasswordChanged } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { ROLES } = require("../config/roles");
const controller = require("../controllers/doctorLabOrder.controller");
const v = require("../validators/doctorValidator");

const router = express.Router();
router.use(protect, authorize(ROLES.DOCTOR), blockUntilPasswordChanged);
router.get("/", v.validateSearch, v.handleValidationErrors, controller.getWorkspace);
router.post("/requests", v.validateCreateLabRequest, v.handleValidationErrors, controller.createRequest);

module.exports = router;