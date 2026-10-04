const express = require("express");
const router = express.Router();
const { protect, blockUntilPasswordChanged } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { uploadResultAttachments } = require("../middleware/upload");
const ROLES = require("../constants/roles");
const lab = require("../controllers/lab.controller");

// `protect` first (populates req.user), then the forced-password-change gate.
// A Laboratory account activated from an approved request cannot touch the lab
// workflow until its temporary password has been replaced.
router.use(protect, authorize(ROLES.LABORATORY), blockUntilPasswordChanged);
router.get("/dashboard", lab.dashboard);
router.get("/requests", lab.requests);
router.get("/requests/:id", lab.request);
router.post("/requests/:id/accept", lab.acceptRequest);
router.patch("/requests/:id/status", lab.updateRequestStatus);
router.get("/samples", lab.samples);
router.get("/samples/:id", lab.sample);
router.post("/samples", lab.createSample);
router.patch("/samples/:id", lab.updateSample);
// SRS FR-LB-03: the specimen's machine-readable code. `format` picks the
// symbology; both encode the same non-PHI payload, so a printed barcode and a
// scanned QR are interchangeable.
router.get("/samples/:id/label", lab.sampleLabel);
// Specimen receipt: resolve a scanned/typed label back to its sample.
router.post("/samples/lookup", lab.findSample);
router.get("/processing", lab.processing);
router.get("/processing/:id", lab.processingItem);
router.patch("/processing/:id/start", lab.startProcessing);
router.patch("/processing/:id/complete", lab.completeProcessing);
router.get("/results", lab.results);
router.get("/results/:id", lab.result);
router.post("/results", uploadResultAttachments, lab.createResult);
router.patch("/results/:id", lab.updateResult);
// Attachments live outside the web root; this authenticated route is the only
// way to read one, and it never exposes a filesystem path.
router.get("/results/:id/attachments/:fileId", lab.downloadAttachment);
router.get("/reports", lab.reports);
router.get("/reports/:id", lab.report);
router.post("/reports", lab.createReport);
router.patch("/reports/:id/verify", lab.verifyReport);
// SRS FR-LB-05: generate -> verify -> approve. Approval is the final sign-off
// that makes the document immutable; corrections go through /revise.
router.patch("/reports/:id/approve", lab.approveReport);
router.post("/reports/:id/revise", lab.reviseReport);
// SRS FR-LB-06: test categories, prices and reference ranges are managed here.
router.get("/categories", lab.categories);
router.post("/categories", lab.createCategory);
router.patch("/categories/:id", lab.updateCategory);
router.delete("/categories/:id", lab.deleteCategory);
router.get("/tests", lab.tests);
router.get("/tests/:id", lab.test);
router.get("/tests/:id/parameters", lab.testParameters);
router.post("/tests", lab.createTest);
router.patch("/tests/:id", lab.updateTest);
router.delete("/tests/:id", lab.deleteTest);
router.patch("/tests/:id/status", lab.setTestActive);
router.get("/patients/:id", lab.patient);
router.get("/search", lab.search);
router.get("/notifications", lab.notifications);
router.get("/notifications/unread-count", lab.unreadNotificationCount);
router.patch("/notifications/:id/read", lab.readNotification);
router.patch("/notifications/read-all", lab.readAllNotifications);
router.get("/profile", lab.profile);
router.patch("/profile", lab.updateProfile);
router.patch("/profile/password", lab.updatePassword);
router.get("/settings", lab.settings);
router.patch("/settings", lab.updateSettings);

module.exports = router;
