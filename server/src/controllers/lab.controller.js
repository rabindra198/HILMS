const fs = require("fs");
const labService = require("../services/lab.service");
const { resolveAttachmentPath, discardFiles } = require("../middleware/upload");
const response = require("../utils/response");

/**
 * Thin HTTP layer: parse, delegate, respond. No business logic here.
 *
 * List endpoints keep returning a plain ARRAY in `data`, so every existing
 * frontend caller is unaffected. Pagination metadata rides alongside as a
 * sibling key produced by `response.success(res, data, code, message, meta)`.
 */
const run = (handler, successMessage = "Success", statusCode = 200) => async (req, res, next) => {
  try {
    const result = await handler(req);
    if (result && result.data !== undefined && result.pagination !== undefined) {
      return response.success(res, result.data, statusCode, successMessage, { pagination: result.pagination });
    }
    return response.success(res, result, statusCode, successMessage);
  } catch (error) {
    return next(error);
  }
};

const userId = (req) => req.user._id;

/**
 * multipart/form-data can only carry text fields, so a JSON request body such
 * as `parameters: [{ name, value }]` arrives as a STRING. Rehydrate the fields
 * that are structured JSON in the plain-JSON endpoint, leaving scalars alone.
 * A malformed blob is passed through untouched so validation, not this helper,
 * decides the response code.
 */
const parseJsonFields = (body) => {
  const parsed = { ...body };
  for (const field of ["parameters", "attachments"]) {
    if (typeof parsed[field] !== "string") continue;
    try {
      parsed[field] = JSON.parse(parsed[field]);
    } catch {
      /* leave as-is; the service rejects it with a proper 422 */
    }
  }
  return parsed;
};

const controller = {
  dashboard: run((req) => labService.getDashboard(userId(req))),

  // ---- requests ----
  requests: run((req) => labService.getRequests(req.query)),
  request: run((req) => labService.getRequest(req.params.id)),
  acceptRequest: run((req) => labService.acceptRequest(req.params.id, userId(req)), "Request accepted successfully"),
  updateRequestStatus: run((req) => labService.updateRequestStatus(req.params.id, req.body.status, userId(req), { reason: req.body.reason }), "Request status updated"),

  // ---- samples ----
  samples: run((req) => labService.getSamples(req.query)),
  sample: run((req) => labService.getSample(req.params.id)),
  createSample: run((req) => labService.createSample(req.body, userId(req)), "Sample collected successfully", 201),
  updateSample: run((req) => labService.updateSample(req.params.id, req.body, userId(req)), "Sample updated successfully"),

  // SRS FR-LB-03: the generated code, as printable SVG rather than a string, so
  // it is scannable with a bench printer or a phone camera.
  sampleLabel: run((req) => labService.getSampleLabel(req.params.id, { format: req.query.format }), "Specimen label generated"),

  /**
   * Specimen receipt by code scan (SRS FR-LB-03: "the generated QR/barcode must
   * be usable later to identify the sample"). Resolves a scanned or typed label
   * to the sample it identifies and stamps the chain-of-custody fields.
   */
  findSample: run((req) => labService.findSampleByCode(req.body?.code ?? req.query.code, userId(req)), "Specimen identified"),
  // ---- processing ----
  processing: run((req) => labService.getProcessing(req.query)),
  processingItem: run((req) => labService.getProcessingItem(req.params.id)),
  startProcessing: run((req) => labService.startProcessing(req.params.id, userId(req), req.body.notes), "Processing started"),
  completeProcessing: run((req) => labService.completeProcessing(req.params.id, userId(req), req.body.notes), "Processing completed"),

  // ---- results ----
  results: run((req) => labService.getResults(req.query)),
  result: run((req) => labService.getResult(req.params.id)),

  // multipart: `attachments` files arrive on req.files, already validated and
  // written outside the web root by middleware/upload.js
  createResult: async (req, res, next) => {
    try {
      const files = Array.isArray(req.files) ? req.files : [];
      const attachments = files.map((file) => ({
        id: file.filename,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId(req),
        uploadedAt: new Date(),
      }));
      const result = await labService.createResult({ ...parseJsonFields(req.body), attachments }, userId(req));
      return response.success(res, result, 201, "Result entered successfully");
    } catch (error) {
      // The uploads succeeded but the result did not, so the files are
      // unreferenced. Leaving them on disk would let a caller fill the upload
      // directory with content that no row points at.
      discardFiles(req.files);
      return next(error);
    }
  },

  updateResult: run((req) => labService.updateResult(req.params.id, req.body, userId(req)), "Result updated successfully"),

  /**
   * Streams one attachment. Authorisation is the router's `protect` +
   * `authorize(lab)`; the on-disk name is resolved only through
   * `resolveAttachmentPath`, which rejects anything path-like. The client never
   * receives a filesystem path.
   */
  downloadAttachment: async (req, res, next) => {
    try {
      const result = await labService.getResult(req.params.id);
      const attachment = (result.attachments || []).find((item) => item.id === req.params.fileId);
      if (!attachment) {
        return response.error(res, "Attachment not found", 404);
      }
      const filePath = resolveAttachmentPath(attachment.id);
      if (!filePath) {
        return response.error(res, "Attachment is no longer available on the server", 404);
      }
      res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${String(attachment.fileName || "attachment").replace(/[^\w.\- ]/g, "_")}"`);
      return fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      return next(error);
    }
  },

  // ---- reports ----
  reports: run((req) => labService.getReports(req.query)),
  report: run((req) => labService.getReport(req.params.id)),
  createReport: run((req) => labService.createReport(req.body, userId(req)), "Report generated successfully", 201),
  // The reviewer's attestations travel in the body; the service refuses to
  // verify a report until every check is confirmed.
  verifyReport: run((req) => labService.verifyReport(req.params.id, userId(req), { checks: req.body?.checks }), "Report verified successfully"),
  // SRS FR-LB-05: generate -> verify -> approve.
  approveReport: run((req) => labService.approveReport(req.params.id, userId(req)), "Report approved successfully"),
  // A released report is never overwritten; a correction is issued as a revision.
  reviseReport: run((req) => labService.reviseReport(req.params.id, req.body, userId(req)), "Corrected revision raised", 201),

  // ---- test categories (FR-LB-06) ----
  categories: run((req) => labService.getCategories({ includeInactive: req.query.includeInactive === "true" })),
  createCategory: run((req) => labService.createCategory(req.body), "Test category created", 201),
  updateCategory: run((req) => labService.updateCategory(req.params.id, req.body), "Test category updated"),
  deleteCategory: run((req) => labService.deleteCategory(req.params.id), "Test category removed"),

  // ---- tests ----
  // `includeInactive=true` must return EVERY test. It previously passed
  // `{ $exists: true }`, which matches all documents, so the flag did nothing
  // and inactive tests were never reachable.
  tests: run((req) => labService.getTests(req.query.includeInactive === "true" ? {} : { isActive: true })),
  test: run((req) => labService.getTest(req.params.id)),
  // The blank result-entry rows for this test, with its configured reference
  // ranges resolved for the patient where one is supplied.
  testParameters: run((req) => labService.getTestParameterTemplate(req.params.id, req.query.patient)),
  createTest: run((req) => labService.createTest(req.body), "Laboratory test created", 201),
  updateTest: run((req) => labService.updateTest(req.params.id, req.body), "Laboratory test updated"),
  deleteTest: run((req) => labService.deleteTest(req.params.id), "Laboratory test deactivated"),
  setTestActive: run((req) => labService.setTestActive(req.params.id, req.body.isActive, userId(req)), "Laboratory test availability updated"),

  // ---- context ----
  patient: run((req) => labService.getPatient(req.params.id)),
  search: run((req) => labService.search(req.query.q)),

  // ---- notifications ----
  notifications: run((req) => labService.getNotifications(userId(req), req.query)),
  unreadNotificationCount: run((req) => labService.getUnreadNotificationCount(userId(req))),
  readNotification: run((req) => labService.markNotificationRead(req.params.id, userId(req)), "Notification marked as read"),
  readAllNotifications: run((req) => labService.markAllNotificationsRead(userId(req)), "Notifications marked as read"),

  // ---- account ----
  profile: run((req) => labService.getProfile(userId(req))),
  updateProfile: run((req) => labService.updateProfile(userId(req), req.body), "Profile updated successfully"),
  updatePassword: run((req) => labService.updatePassword(userId(req), req.body), "Password updated successfully"),
  settings: run((req) => labService.getSettings(userId(req))),
  updateSettings: run((req) => labService.updateSettings(userId(req), req.body), "Settings updated successfully"),
};

module.exports = controller;
