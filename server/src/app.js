import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import doctorRoutes from "./routes/doctor.js";
import patientRoutes from "./routes/patient.js";
import labRoutes from "./routes/lab.js";
import patientsRoutes from "./routes/patients.js";
import appointmentsRoutes from "./routes/appointments.js";
import errorMiddleware from "./middleware/errorMiddleware.js";

dotenv.config();

const app = express();

void connectDB();

app.use(cors({
  origin: function(origin, callback) {
    if (process.env.NODE_ENV === "production") {
      return callback(null, "https://your-frontend-domain.com");
    }
    callback(null, origin);
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/appointments", appointmentsRoutes);

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
