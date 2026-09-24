const labService = require("../services/lab.service");
const response = require("../utils/response");

const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => { try { const data = await handler(req); response.success(res, data, statusCode, successMessage); } catch (error) { next(error); } };
const userId = (req) => req.user._id;

const controller = {
  dashboard: run((req) => labService.getDashboard()),
  requests: run((req) => labService.getRequests(req.query.status ? { status: req.query.status.toUpperCase() } : {})),
  request: run((req) => labService.getRequest(req.params.id)),
  acceptRequest: run((req) => labService.acceptRequest(req.params.id, userId(req)), "Request accepted successfully"),
  updateRequestStatus: run((req) => labService.updateRequestStatus(req.params.id, req.body.status, userId(req)), "Request status updated"),
  samples: run((req) => labService.getSamples(req.query.status ? { status: req.query.status.toUpperCase() } : {})),
  sample: run((req) => labService.getSample(req.params.id)),
  createSample: run((req) => labService.createSample(req.body, userId(req)), "Sample collected successfully", 201),
  updateSample: run((req) => labService.updateSample(req.params.id, req.body), "Sample updated successfully"),
  processing: run(() => labService.getProcessing()),
  processingItem: run((req) => labService.getProcessingItem(req.params.id)),
  startProcessing: run((req) => labService.startProcessing(req.params.id, userId(req), req.body.notes), "Processing started"),
  completeProcessing: run((req) => labService.completeProcessing(req.params.id, userId(req), req.body.notes), "Processing completed"),
  results: run((req) => labService.getResults(req.query.labRequest ? { labRequest: req.query.labRequest } : {})),
  result: run((req) => labService.getResult(req.params.id)),
  createResult: run((req) => labService.createResult(req.body, userId(req)), "Result entered successfully", 201),
  updateResult: run((req) => labService.updateResult(req.params.id, req.body), "Result updated successfully"),
  reports: run((req) => labService.getReports(req.query.status ? { status: req.query.status.toUpperCase() } : {})),
  report: run((req) => labService.getReport(req.params.id)),
  createReport: run((req) => labService.createReport(req.body, userId(req)), "Report generated successfully", 201),
  verifyReport: run((req) => labService.verifyReport(req.params.id, userId(req)), "Report verified successfully"),
  tests: run((req) => labService.getTests({ isActive: req.query.includeInactive === "true" ? { $exists: true } : true })),
  test: run((req) => labService.getTest(req.params.id)),
  createTest: run((req) => labService.createTest(req.body), "Laboratory test created", 201),
  updateTest: run((req) => labService.updateTest(req.params.id, req.body), "Laboratory test updated"),
  deleteTest: run((req) => labService.deleteTest(req.params.id), "Laboratory test deactivated"),
  patient: run((req) => labService.getPatient(req.params.id)),
  search: run((req) => labService.search(req.query.q)),
  notifications: run((req) => labService.getNotifications(userId(req))),
  readNotification: run((req) => labService.markNotificationRead(req.params.id, userId(req)), "Notification marked as read"),
  readAllNotifications: run((req) => labService.markAllNotificationsRead(userId(req)), "Notifications marked as read"),
  profile: run((req) => labService.getProfile(userId(req))),
  updateProfile: run((req) => labService.updateProfile(userId(req), req.body), "Profile updated successfully"),
  updatePassword: run((req) => labService.updatePassword(userId(req), req.body), "Password updated successfully"),
  settings: run((req) => labService.getSettings(userId(req))),
  updateSettings: run((req) => labService.updateSettings(userId(req), req.body), "Settings updated successfully"),
};

module.exports = controller;
