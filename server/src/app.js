const express = require("express");
const cors = require("cors");

const corsOptions = require("./config/cors");
const authRoutes = require("./routes/auth.routes");
const laboratoryRoutes = require("./routes/laboratory.routes");
const { notFound } = require("./middleware/notFound.middleware");
const { errorHandler } = require("./middleware/error.middleware");

const app = express();

app.use(cors(corsOptions));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ success: true, message: "HILMS API running" }));

app.use("/api/auth", authRoutes);
app.use("/api/laboratory", laboratoryRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;