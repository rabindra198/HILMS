const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./config/env");

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Render serves the whole HILMS application from one Node web service.
// The Vite build is generated at client/dist during the root postinstall step.
const clientDist = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// In production the React app calls /api/*, while the existing Express
// routers are mounted without the /api prefix. Normalize the URL once so
// both the Vite development proxy and the production build work.
app.use((req, res, next) => {
  if (req.url === "/api" || req.url.startsWith("/api/")) {
    req.url = req.url.slice("/api".length) || "/";
  }
  next();
});

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const labRoutes = require("./routes/laboratory.routes");
const doctorLaboratoryRoutes = require("./routes/doctorLaboratory.routes");
const doctorRoutes = require("./routes/doctor.routes");
const patientRoutes = require("./routes/patient.routes");
const paymentRoutes = require("./routes/payment.routes");
const profileRoutes = require("./routes/profile.routes");
const { errorHandler } = require("./middleware/error.middleware");
const { validateStaffAccessRequest } = require("./validators/accessRequestValidator");
const { handleValidationErrors } = require("./validators/validationHandler");
const accessRequestController = require("./controllers/accessRequest.controller");

// The Vite dev proxy strips the leading "/api" before forwarding, so the
// client calls /api/health while Express sees /health. Both must resolve.
const healthHandler = (req, res) => {
  res.json({ success: true, status: "ok", message: "Server is running" });
};
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/lab", labRoutes);

// Doctor module. The laboratory sub-router is mounted at /doctor/laboratory and
// the clinical module at /doctor. Order is irrelevant here because the paths do
// not overlap, but both carry their own auth/role guards internally.
app.use("/doctor/laboratory", doctorLaboratoryRoutes);
app.use("/doctor", doctorRoutes);

// Patient module. Self-service only: every route derives the patient from the
// session, and none of them accept a patient id, so the router has no route that
// could address another patient's record.
app.use("/patient", patientRoutes);

// Payment module (SRS 5.4). Shared by Patient and Admin rather than nested under
// either, because both pay the same invoices against the same Payment records.
app.use("/payments", paymentRoutes);
app.use("/profile", profileRoutes);

// SRS-documented alias for the public staff submission. It reuses the exact same
// validator, controller and service as POST /api/auth/access-requests - it is one
// route, not a second implementation.
app.post(
  "/access-requests",
  validateStaffAccessRequest,
  handleValidationErrors,
  accessRequestController.submit
);
app.post("/api/access-requests", validateStaffAccessRequest, handleValidationErrors, accessRequestController.submit);

// Unknown API routes. Return JSON for API-style requests; otherwise let
// the React SPA fallback below handle client-side routes.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/api") {
    return res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  }
  next();
});

// React Router handles client-side routes in the browser.
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/auth") ||
      req.path.startsWith("/admin") ||
      req.path.startsWith("/lab") ||
      req.path.startsWith("/doctor") ||
      req.path.startsWith("/patient") ||
      req.path.startsWith("/payments") ||
      req.path.startsWith("/profile") ||
      req.path.startsWith("/access-requests") ||
      req.path.startsWith("/health")) {
    return next();
  }

  res.sendFile(path.join(clientDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use(errorHandler);

module.exports = app;
