const mongoose = require("mongoose");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const VALID_REQUEST_STATUSES = ["pending", "sample_collected", "processing", "completed", "cancelled"];
const VALID_SAMPLE_STATUSES = ["not_collected", "collected", "rejected"];

const validateUpdateRequestStatus = (req, res, next) => {
  const { status, sampleStatus } = req.body;
  if (!status && !sampleStatus) {
    return res.status(400).json({ success: false, message: "Provide status or sampleStatus to update" });
  }
  if (status && !VALID_REQUEST_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${VALID_REQUEST_STATUSES.join(", ")}` });
  }
  if (sampleStatus && !VALID_SAMPLE_STATUSES.includes(sampleStatus)) {
    return res.status(400).json({ success: false, message: `Invalid sampleStatus. Must be one of: ${VALID_SAMPLE_STATUSES.join(", ")}` });
  }
  next();
};

const validateCreateLabReport = (req, res, next) => {
  const { labRequest, patient, test, result } = req.body;
  if (!labRequest || !isValidObjectId(labRequest)) {
    return res.status(400).json({ success: false, message: "Valid labRequest id is required" });
  }
  if (!patient || !isValidObjectId(patient)) {
    return res.status(400).json({ success: false, message: "Valid patient id is required" });
  }
  if (!test || !isValidObjectId(test)) {
    return res.status(400).json({ success: false, message: "Valid test id is required" });
  }
  if (!result || typeof result !== "string" || !result.trim()) {
    return res.status(400).json({ success: false, message: "result is required" });
  }
  next();
};

module.exports = { isValidObjectId, validateUpdateRequestStatus, validateCreateLabReport };