import axios from "@/lib/axios";
import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
};

// ⚠️ TEMPORARY DEV-ONLY BYPASS ⚠️
// Only activates when VITE_BYPASS_AUTH="true" in .env.
// Role is auto-detected from the URL path (/doctor, /lab, /patient, /admin) —
// no need to set or change any role env var manually.
// REMOVE or set VITE_BYPASS_AUTH=false before staging/production deploy.
const DEV_MOCK_USERS = {
  admin: {
    id: "dev-mock-admin",
    name: "Dev Admin",
    email: "dev-admin@hilms.local",
    phone: "",
    role: "admin",
    roleLabel: "Admin",
    permissions: [
      "admin.overview.view",
      "users.manage",
      "doctors.manage",
      "patients.view",
      "patients.timeline.view",
      "appointments.manage",
      "laboratory.view",
      "billing.manage",
      "reports.export",
      "audit_logs.view",
      "settings.manage",
    ],
    status: "active",
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: null,
    updatedAt: null,
  },
  doctor: {
    id: "dev-mock-doctor",
    name: "Dev Doctor",
    email: "dev-doctor@hilms.local",
    phone: "",
    role: "doctor",
    roleLabel: "Doctor",
    permissions: [
      "doctor.dashboard.view",
      "appointments.view",
      "patients.view",
      "consultations.manage",
      "prescriptions.manage",
      "laboratory_reports.view",
      "follow_ups.manage",
      "schedule.manage",
    ],
    status: "active",
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: null,
    updatedAt: null,
  },
  lab: {
    id: "dev-mock-lab",
    name: "Dev Lab Technician",
    email: "dev-lab@hilms.local",
    phone: "",
    role: "lab",
    roleLabel: "Laboratory",
    permissions: [
      "laboratory.dashboard.view",
      "requests.view",
      "samples.manage",
      "processing.manage",
      "reports.manage",
    ],
    status: "active",
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: null,
    updatedAt: null,
  },
  patient: {
    id: "dev-mock-patient",
    name: "Dev Patient",
    email: "dev-patient@hilms.local",
    phone: "",
    role: "patient",
    roleLabel: "Patient",
    permissions: [
      "patient.dashboard.view",
      "appointments.view",
      "medical_history.view",
      "prescriptions.view",
      "laboratory_reports.view",
      "payments.view",
    ],
    status: "active",
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: null,
    updatedAt: null,
  },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (import.meta.env.VITE_BYPASS_AUTH === "true") {
        const path = window.location.pathname;
        let bypassRole = "admin"; // fallback

        if (path.startsWith("/doctor")) bypassRole = "doctor";
        else if (path.startsWith("/lab")) bypassRole = "lab";
        else if (path.startsWith("/patient")) bypassRole = "patient";
        else if (path.startsWith("/admin")) bypassRole = "admin";

        const mockUser = DEV_MOCK_USERS[bypassRole] || DEV_MOCK_USERS.admin;
        setUser(mockUser);
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      const token = getCookie("token");

      if (!token) {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      try {
        const res = await axios.get("/auth/me");
        setUser(res.data);
        setIsAuthenticated(true);
      } catch (error) {
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const res = await axios.post("/auth/login", { email, password });
    setUser(res.data);
    setIsAuthenticated(true);
    return res.data;
  };

  const signup = async (name, email, password, phone, role) => {
    const res = await axios.post("/auth/signup", { name, email, password, phone, role });
    setUser(res.data);
    setIsAuthenticated(true);
    return res.data;
  };

  const logout = async () => {
    await axios.post("/auth/logout");
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);