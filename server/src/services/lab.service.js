const mongoose = require("mongoose");
const User = require("../models/User");
const LabTest = require("../models/LabTest");
const LabRequest = require("../models/LabRequest");
const SampleCollection = require("../models/SampleCollection");
const LabResult = require("../models/LabResult");
const LabReport = require("../models/LabReport");
const Notification = require("../models/Notification");
const LabSettings = require("../models/LabSettings");

const REQUEST_STATUSES = ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED"];
const TRANSITIONS = {
  PENDING: ["ACCEPTED"],
  ACCEPTED: ["SAMPLE_COLLECTED"],
  SAMPLE_COLLECTED: ["PROCESSING"],
  PROCESSING: ["COMPLETED"],
  COMPLETED: ["VERIFIED"],
  VERIFIED: [],
};

const fail = (message, statusCode = 400) => { const error = new Error(message); error.statusCode = statusCode; throw error; };
const id = (value, name = "id") => { if (!value || !mongoose.Types.ObjectId.isValid(value)) fail(`Valid ${name} is required`); return value; };
const normalizePriority = (value) => String(value || "ROUTINE").toUpperCase();
const requestPopulate = (query) => query.populate("patient", "name email phone").populate("doctor", "name email").populate("test", "name testName testCode category sampleType");
const labRequestQuery = (filter = {}) => requestPopulate(LabRequest.find(filter).sort({ createdAt: -1 }));
const notify = (recipient, type, title, message, entityType, entityId) => Notification.create({ recipient, type, title, message, entityType, entityId });

const getDashboard = async () => {
  const count = (statuses) => LabRequest.countDocuments({ status: { $in: statuses } });
  const [pendingRequests, acceptedRequests, samplesCollected, processingTests, completedTests, verifiedReports, recentRequests, recentReports] = await Promise.all([
    count(["PENDING", "pending"]), count(["ACCEPTED"]), count(["SAMPLE_COLLECTED"]), count(["PROCESSING", "processing"]), count(["COMPLETED", "completed"]), LabReport.countDocuments({ status: "VERIFIED" }),
    labRequestQuery().limit(8), LabReport.find().populate("patient", "name").populate("doctor", "name").populate("test", "name testName").sort({ createdAt: -1 }).limit(8),
  ]);
  return { pendingRequests, acceptedRequests, samplesCollected, processingTests, completedTests, verifiedReports, recentRequests, recentReports };
};

const getRequests = async (filter = {}) => labRequestQuery(filter);
const getRequest = async (requestId) => { id(requestId, "lab request id"); const result = await labRequestQuery({ _id: requestId }).findOne(); if (!result) fail("Laboratory request not found", 404); return result; };
const acceptRequest = async (requestId, userId) => { const request = await LabRequest.findById(id(requestId, "lab request id")); if (!request) fail("Laboratory request not found", 404); if (!["PENDING", "pending"].includes(request.status)) fail(`Cannot accept a request in ${request.status} status`); request.status = "ACCEPTED"; request.acceptedBy = userId; request.acceptedAt = new Date(); request.updatedBy = userId; await request.save(); await notify(request.doctor, "LAB_REQUEST_ACCEPTED", "Laboratory request accepted", "Your laboratory request has been accepted.", "LabRequest", request._id); return getRequest(request._id); };

const updateRequestStatus = async (requestId, nextStatus, userId) => { const request = await LabRequest.findById(id(requestId, "lab request id")); if (!request) fail("Laboratory request not found", 404); const current = String(request.status).toUpperCase(); const target = String(nextStatus || "").toUpperCase(); if (!REQUEST_STATUSES.includes(target)) fail(`Invalid status. Use: ${REQUEST_STATUSES.join(", ")}`); if (!TRANSITIONS[current]?.includes(target)) fail(`Invalid status transition: ${current} to ${target}`); request.status = target; request.updatedBy = userId; if (target === "SAMPLE_COLLECTED") request.sampleStatus = "COLLECTED"; await request.save(); return getRequest(request._id); };

const nextSampleId = async () => { const year = new Date().getFullYear(); const latest = await SampleCollection.findOne({ sampleId: new RegExp(`^SMP-${year}-`) }).sort({ createdAt: -1 }).select("sampleId").lean(); const number = latest ? Number(latest.sampleId.split("-").pop()) + 1 : 1; return `SMP-${year}-${String(number).padStart(4, "0")}`; };
const getSamples = async (filter = {}) => SampleCollection.find(filter).populate("patient", "name email").populate("test", "name testName category").populate("labRequest").populate("collectedBy", "name").sort({ createdAt: -1 });
const getSample = async (sampleId) => { id(sampleId, "sample id"); const sample = await SampleCollection.findById(sampleId).populate("patient", "name email").populate("test", "name testName category").populate("labRequest").populate("collectedBy", "name"); if (!sample) fail("Sample not found", 404); return sample; };
const createSample = async (data, userId) => { const request = await LabRequest.findById(id(data.labRequest, "lab request id")).populate("test"); if (!request) fail("Laboratory request not found", 404); if (!["ACCEPTED", "SAMPLE_COLLECTED"].includes(String(request.status).toUpperCase())) fail("Only accepted requests can have samples collected"); if (await SampleCollection.exists({ labRequest: request._id })) fail("A sample already exists for this laboratory request", 409); const sample = await SampleCollection.create({ sampleId: await nextSampleId(), labRequest: request._id, patient: request.patient, test: request.test._id, sampleType: data.sampleType || request.test.sampleType, collectionDate: data.collectionDate || new Date(), collectedBy: userId, barcode: data.barcode || undefined, notes: data.notes }); request.status = "SAMPLE_COLLECTED"; request.sampleStatus = "COLLECTED"; request.updatedBy = userId; await request.save(); await notify(request.doctor, "SAMPLE_COLLECTED", "Sample collected", "A sample for your laboratory request has been collected.", "SampleCollection", sample._id); return getSample(sample._id); };
const updateSample = async (sampleId, data) => { const sample = await SampleCollection.findById(id(sampleId, "sample id")); if (!sample) fail("Sample not found", 404); ["status", "notes", "barcode"].forEach((field) => { if (data[field] !== undefined) sample[field] = data[field]; }); await sample.save(); return getSample(sample._id); };

const getProcessing = async () => LabRequest.find({ status: { $in: ["SAMPLE_COLLECTED", "PROCESSING"] } }).populate("patient", "name").populate("test", "name testName").populate("doctor", "name").sort({ updatedAt: -1 });
const getProcessingItem = async (requestId) => getRequest(requestId);
const startProcessing = async (requestId, userId, notes) => { const request = await LabRequest.findById(id(requestId, "lab request id")); if (!request) fail("Laboratory request not found", 404); if (request.status !== "SAMPLE_COLLECTED") fail("Only collected samples can start processing"); request.status = "PROCESSING"; request.updatedBy = userId; request.processingStartedAt = new Date(); request.processingNotes = notes; request.processedBy = userId; await request.save(); return getRequest(request._id); };
const completeProcessing = async (requestId, userId, notes) => { const request = await LabRequest.findById(id(requestId, "lab request id")); if (!request) fail("Laboratory request not found", 404); if (request.status !== "PROCESSING") fail("Only processing requests can be completed"); request.status = "COMPLETED"; request.updatedBy = userId; request.processingCompletedAt = new Date(); request.processingNotes = notes || request.processingNotes; request.processedBy = userId; await request.save(); return getRequest(request._id); };

const resultPopulate = (query) => query.populate("patient", "name email").populate("test", "name testName category").populate("sample", "sampleId sampleType").populate("enteredBy", "name");
const getResults = async (filter = {}) => resultPopulate(LabResult.find(filter).sort({ createdAt: -1 }));
const getResult = async (resultId) => { id(resultId, "result id"); const result = await resultPopulate(LabResult.findById(resultId)); if (!result) fail("Laboratory result not found", 404); return result; };
const createResult = async (data, userId) => { const request = await LabRequest.findById(id(data.labRequest, "lab request id")); if (!request) fail("Laboratory request not found", 404); if (!["COMPLETED", "PROCESSING"].includes(request.status)) fail("Processing must be completed before entering results"); const sample = await SampleCollection.findById(id(data.sample, "sample id")); if (!sample || String(sample.labRequest) !== String(request._id)) fail("Sample does not belong to this laboratory request"); if (!Array.isArray(data.parameters) || data.parameters.length === 0) fail("At least one result parameter is required"); const result = await LabResult.create({ ...data, patient: request.patient, test: request.test, enteredBy: userId, enteredAt: new Date() }); return getResult(result._id); };
const updateResult = async (resultId, data) => { const result = await LabResult.findById(id(resultId, "result id")); if (!result) fail("Laboratory result not found", 404); ["parameters", "attachments"].forEach((field) => { if (data[field] !== undefined) result[field] = data[field]; }); await result.save(); return getResult(result._id); };

const reportPopulate = (query) => query.populate("patient", "name email").populate("doctor", "name email").populate("test", "name testName category").populate("sample", "sampleId sampleType").populate("results").populate("generatedBy", "name").populate("verifiedBy", "name");
const getReports = async (filter = {}) => reportPopulate(LabReport.find(filter).sort({ createdAt: -1 }));
const getReport = async (reportId) => { id(reportId, "report id"); const report = await reportPopulate(LabReport.findById(reportId)); if (!report) fail("Laboratory report not found", 404); return report; };
const nextReportId = async () => { const year = new Date().getFullYear(); const count = await LabReport.countDocuments({ reportId: new RegExp(`^RPT-${year}-`) }); return `RPT-${year}-${String(count + 1).padStart(4, "0")}`; };
const createReport = async (data, userId) => { const request = await LabRequest.findById(id(data.labRequest, "lab request id")); if (!request) fail("Laboratory request not found", 404); if (request.status !== "COMPLETED") fail("Only completed requests can generate reports"); const resultIds = data.results || []; if (!resultIds.length) fail("At least one result is required"); const report = await LabReport.create({ reportId: await nextReportId(), labRequest: request._id, patient: request.patient, doctor: request.doctor, test: request.test, sample: id(data.sample, "sample id"), results: resultIds, remarks: data.remarks, generatedBy: userId, status: "COMPLETED" }); return getReport(report._id); };
const verifyReport = async (reportId, userId) => { const report = await LabReport.findById(id(reportId, "report id")); if (!report) fail("Laboratory report not found", 404); if (report.status !== "COMPLETED") fail("Only completed reports can be verified"); report.status = "VERIFIED"; report.verifiedBy = userId; report.verifiedAt = new Date(); await report.save(); await LabRequest.findByIdAndUpdate(report.labRequest, { status: "VERIFIED", updatedBy: userId }); await Promise.all([notify(report.doctor, "REPORT_VERIFIED", "Laboratory report verified", "A laboratory report is ready for review.", "LabReport", report._id), notify(report.patient, "REPORT_VERIFIED", "Laboratory report available", "Your laboratory report is now available.", "LabReport", report._id)]); return getReport(report._id); };

const getTests = async (filter = {}) => LabTest.find(filter).sort({ category: 1, name: 1 });
const getTest = async (testId) => { id(testId, "test id"); const test = await LabTest.findById(testId); if (!test) fail("Laboratory test not found", 404); return test; };
const createTest = async (data) => LabTest.create({ ...data, name: data.name || data.testName });
const updateTest = async (testId, data) => { const test = await LabTest.findByIdAndUpdate(id(testId, "test id"), { $set: data }, { new: true, runValidators: true }); if (!test) fail("Laboratory test not found", 404); return test; };
const deleteTest = async (testId) => { const test = await LabTest.findByIdAndUpdate(id(testId, "test id"), { isActive: false }, { new: true }); if (!test) fail("Laboratory test not found", 404); return test; };

const getPatient = async (patientId) => { const patient = await User.findOne({ _id: id(patientId, "patient id"), role: "patient", isActive: true }).select("name email phone createdAt"); if (!patient) fail("Patient not found", 404); const [requests, reports] = await Promise.all([labRequestQuery({ patient: patient._id }), getReports({ patient: patient._id })]); return { patient, laboratoryRequests: requests, previousReports: reports }; };
const search = async (query) => { const q = String(query || "").trim(); if (q.length < 2) return { patients: [], requests: [], samples: [], tests: [], reports: [] }; const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); const [patients, requests, samples, tests, reports] = await Promise.all([User.find({ role: "patient", $or: [{ name: regex }, { email: regex }] }).select("name email").limit(10), labRequestQuery({ $or: [{ clinicalNotes: regex }] }).limit(10), SampleCollection.find({ $or: [{ sampleId: regex }, { barcode: regex }] }).populate("patient", "name").limit(10), LabTest.find({ $or: [{ name: regex }, { testName: regex }, { testCode: regex }] }).limit(10), LabReport.find({ reportId: regex }).populate("patient", "name").limit(10)]); return { patients, requests, samples, tests, reports }; };

const getNotifications = async (userId) => Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(50);
const markNotificationRead = async (notificationId, userId) => { const item = await Notification.findOneAndUpdate({ _id: id(notificationId, "notification id"), recipient: userId }, { readAt: new Date() }, { new: true }); if (!item) fail("Notification not found", 404); return item; };
const markAllNotificationsRead = async (userId) => { await Notification.updateMany({ recipient: userId, readAt: null }, { readAt: new Date() }); return getNotifications(userId); };
const getProfile = async (userId) => User.findById(userId).select("name email phone role isActive createdAt updatedAt");
const updateProfile = async (userId, data) => { const allowed = {}; ["name", "phone"].forEach((field) => { if (data[field] !== undefined) allowed[field] = data[field]; }); return User.findByIdAndUpdate(userId, { $set: allowed }, { new: true, runValidators: true }).select("name email phone role isActive createdAt updatedAt"); };
const updatePassword = async (userId, data) => { if (!data.currentPassword || !data.newPassword || data.newPassword.length < 6) fail("Current password and a new password of at least 6 characters are required"); const user = await User.findById(userId).select("+password"); if (!user || !(await user.comparePassword(data.currentPassword))) fail("Current password is incorrect", 401); user.password = data.newPassword; await user.save(); return { updated: true }; };
const getSettings = async (userId) => LabSettings.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { new: true, upsert: true, setDefaultsOnInsert: true });
const updateSettings = async (userId, data) => { const allowed = {}; ["urgentRequestAlerts", "processingAlerts", "reportVerificationAlerts", "emailNotifications"].forEach((field) => { if (data[field] !== undefined) allowed[field] = Boolean(data[field]); }); return LabSettings.findOneAndUpdate({ user: userId }, { $set: allowed, $setOnInsert: { user: userId } }, { new: true, upsert: true, setDefaultsOnInsert: true }); };

module.exports = { getDashboard, getRequests, getRequest, acceptRequest, updateRequestStatus, getSamples, getSample, createSample, updateSample, getProcessing, getProcessingItem, startProcessing, completeProcessing, getResults, getResult, createResult, updateResult, getReports, getReport, createReport, verifyReport, getTests, getTest, createTest, updateTest, deleteTest, getPatient, search, getNotifications, markNotificationRead, markAllNotificationsRead, getProfile, updateProfile, updatePassword, getSettings, updateSettings };
