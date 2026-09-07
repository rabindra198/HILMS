const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const env = require("./config/env");

const app = express();

app.use(cors({
  origin: env.clientUrl,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const labRoutes = require("./routes/laboratory.routes");

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/lab", labRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

module.exports = app;
