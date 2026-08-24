import axios from "@/lib/axios";
import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
};

const DEV_MOCK_USER = {
  id: "dev-mock-admin",
  name: "Dev Admin",
  email: "dev@hilms.local",
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
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (import.meta.env.VITE_BYPASS_AUTH === "true") {
        setUser(DEV_MOCK_USER);
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
