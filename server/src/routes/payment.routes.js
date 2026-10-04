const express = require("express");
const { protect, blockUntilPasswordChanged } = require("../middleware/auth");
const { authorize } = require("../middleware/role.middleware");
const { ROLES } = require("../config/roles");
const controller = require("../controllers/payment.controller");

/**
 * Payment routes (SRS 5.4).
 *
 * Shared by Patient and Admin - a patient pays their own invoice, an admin takes
 * payment at the desk. Ownership is enforced in `payment.service`, because it
 * depends on WHO is paying rather than on which route was called.
 *
 * Two different authentication models, deliberately:
 *
 *   Authenticated (`protect`) - anything a signed-in user *asks* for: reading the
 *   gateway configuration, starting a payment, checking a status. The session user
 *   is who the invoice must belong to.
 *
 *   Unauthenticated - the two gateway callbacks. eSewa redirects the customer's
 *   browser to `success_url`, not our backend to our backend, so a session that
 *   expired mid-payment would otherwise strand a payment the customer actually
 *   made. These endpoints are instead authenticated by eSewa's HMAC-SHA256
 *   signature over the response payload, which cannot be forged, and settlement
 *   additionally requires the gateway's own status endpoint to confirm the
 *   transaction. A browser merely reaching the URL proves nothing and settles
 *   nothing.
 */
const router = express.Router();

// ---- Gateway callbacks (authenticated by signature, not by session) -------
router.get("/esewa/success", controller.success);
router.post("/esewa/success", controller.success);
router.get("/esewa/failure", controller.failure);
router.post("/esewa/failure", controller.failure);

// ---- Session-authenticated ------------------------------------------------
// Payment is a Patient/Admin relationship: a patient pays their own invoice and an
// admin takes payment at the desk. A doctor or laboratory account has no billing
// relationship to an invoice, so the role is refused here as well as in the
// service-level ownership check - defence in depth, and a clearer error.
router.use(protect, authorize(ROLES.PATIENT, ROLES.ADMIN), blockUntilPasswordChanged);

// Which gateways are usable. Exposes no secret.
router.get("/config", controller.getConfig);

// The provider name is in the path rather than in a body field so the route
// documents itself: /payments/esewa/initiate cannot be mistaken for a different
// gateway later, and adding one does not change this route.
router.post("/esewa/initiate", controller.initiate);
router.post("/esewa/initiate/:invoiceId", controller.initiate);

// Out-of-band status check: settles a transaction whose redirect was lost, and
// backs the "Check status" control on the payment screen.
router.post("/esewa/verify", controller.verify);

// Provider-agnostic read of one stored transaction. Registered last so it cannot
// shadow the fixed paths above.
router.get("/:paymentId/status", controller.getStatus);

module.exports = router;