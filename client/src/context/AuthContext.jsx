import axios from "@/lib/axios";
import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
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
