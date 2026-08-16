const LabRequest = require("../models/LabRequest");
const LabTest = require("../models/LabTest");
const LabReport = require("../models/LabReport");

const getDashboardStats = async () => {
  const [pendingCount, processingCount, completedCount, totalTests, totalReports] = await Promise.all([
    LabRequest.countDocuments({ status: "pending" }),
    LabRequest.countDocuments({ status: "processing" }),
    LabRequest.countDocuments({ status: "completed" }),
    LabTest.countDocuments({ isActive: true }),
    LabReport.countDocuments({ status: "verified" }),
  ]);

  return {
    pendingRequests: pendingCount,
    processingRequests: processingCount,
    completedRequests: completedCount,
    activeTests: totalTests,
    verifiedReports: totalReports,
  };
};

const getPendingRequests = async () => {
  return LabRequest.find({ status: { $in: ["pending", "sample_collected", "processing"] } })
    .populate("patient", "name email")
    .populate("doctor", "name email")
    .populate("test", "name category sampleType")
    .sort({ requestedAt: -1 });
};

const updateLabRequestStatus = async (requestId, { status, sampleStatus }) => {
  const update = {};
  if (status) update.status = status;
  if (sampleStatus) update.sampleStatus = sampleStatus;

  const updated = await LabRequest.findByIdAndUpdate(requestId, update, { new: true })
    .populate("patient", "name email")
    .populate("test", "name category");

  if (!updated) {
    const error = new Error("Lab request not found");
    error.statusCode = 404;
    throw error;
  }

  return updated;
};

const getLabTests = async () => {
  return LabTest.find({ isActive: true }).sort({ category: 1, name: 1 });
};

const getLabReports = async (filter = {}) => {
  return LabReport.find(filter)
    .populate("patient", "name email")
    .populate("test", "name category unit")
    .populate("enteredBy", "name")
    .populate("verifiedBy", "name")
    .sort({ createdAt: -1 });
};

const createLabReport = async (data, enteredByUserId) => {
  const report = await LabReport.create({ ...data, enteredBy: enteredByUserId, status: "draft" });
  await LabRequest.findByIdAndUpdate(data.labRequest, { status: "completed" });
  return report.populate([
    { path: "patient", select: "name email" },
    { path: "test", select: "name category unit" },
  ]);
};

module.exports = {
  getDashboardStats,
  getPendingRequests,
  updateLabRequestStatus,
  getLabTests,
  getLabReports,
  createLabReport,
};