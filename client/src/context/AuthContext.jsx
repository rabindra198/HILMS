import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { unwrap, getErrorMessage } from "@/lib/axios";
import { ACCOUNT_STATUSES, getRoleHome } from "@/lib/roles";

const AuthContext = createContext(null);

/**
 * Reads the authenticated user straight from the backend on every mount.
 *
 * There is no local mock user, no stored role and no dev bypass: the role and
 * account status always come from the server via the httpOnly session cookie.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const response = await api.get("/auth/me");
        const payload = unwrap(response);
        if (cancelled) return;
        setUser(payload.user || payload);
        setIsAuthenticated(true);
      } catch {
        if (cancelled) return;
        // Not signed in, or the session is no longer valid.
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password, remember = false) => {
    const response = await api.post("/auth/login", { email, password, remember });
    const payload = unwrap(response);
    const authenticatedUser = payload.user || payload;
    setUser(authenticatedUser);
    setIsAuthenticated(true);
    return authenticatedUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Cookie may already be gone - clearing local state is still correct.
    }
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  // FR-AUTH-09: recent sign-ins for the current account.
  const getSessions = useCallback(async () => {
    const response = await api.get("/auth/sessions");
    const payload = unwrap(response);
    return payload.sessions || [];
  }, []);

  // FR-AUTH-09 / FR-AUTH-11: sign out of every device. The backend revokes all
  // tokens, so local state is cleared and the user returns to the sign-in page.
  const revokeAllSessions = useCallback(async () => {
    const response = await api.delete("/auth/sessions");
    setUser(null);
    setIsAuthenticated(false);
    return unwrap(response);
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await api.get("/auth/me");
    const payload = unwrap(response);
    const freshUser = payload.user || payload;
    setUser(freshUser);
    setIsAuthenticated(true);
    return freshUser;
  }, []);

  // ---- Public registration paths (no session is created) ----

  /**
   * Patient self-registration. The backend forces the `patient` role and
   * creates an APPROVED, active account immediately (SRS 2.6 / FR-AUTH-02).
   */
  const registerPatient = useCallback(async (payload) => {
    const response = await api.post("/auth/register/patient", payload);
    return unwrap(response);
  }, []);

  /**
   * Doctor / Laboratory access request. The backend stores a PENDING record
   * only - no account, no session, and no password is accepted.
   */
  const requestAccess = useCallback(async (payload) => {
    const response = await api.post("/auth/access-requests", payload);
    return unwrap(response);
  }, []);

  const forgotPassword = useCallback(async (email) => {
    const response = await api.post("/auth/forgot-password", { email });
    return unwrap(response);
  }, []);

  const resetPassword = useCallback(async ({ token, password, confirmPassword }) => {
    const response = await api.post("/auth/reset-password", { token, password, confirmPassword });
    return unwrap(response);
  }, []);

  // Accepts `temporaryPassword` (forced first-login screen) and falls back to
  // `currentPassword`; `confirmPassword` is sent so the backend, not just the
  // client, verifies the two entries match.
  const changePassword = useCallback(async (payload = {}) => {
    const { temporaryPassword, currentPassword, newPassword, confirmPassword } = payload;
    const response = await api.patch("/auth/change-password", {
      temporaryPassword: temporaryPassword ?? currentPassword,
      newPassword,
      confirmPassword,
    });
    // Re-read the user so `mustChangePassword` clears locally without a full
    // reload - otherwise the guard would keep bouncing the user to this page.
    try {
      await refreshUser();
    } catch {
      // A failed refresh is not fatal; the next /auth/me will correct it.
    }
    return unwrap(response);
  }, [refreshUser]);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    // Convenience derived state, always sourced from the backend record.
    role: user?.role ?? null,
    status: user?.status ?? null,
    isApproved: user?.status === ACCOUNT_STATUSES.APPROVED,
    // True while the account still holds an Admin-issued temporary password.
    // The backend enforces this independently - see blockUntilPasswordChanged.
    mustChangePassword: user?.mustChangePassword === true,
    roleHome: user?.role ? getRoleHome(user.role) : "/login",
    login,
    logout,
    refreshUser,
    getSessions,
    revokeAllSessions,
    registerPatient,
    requestAccess,
    forgotPassword,
    resetPassword,
    changePassword,
    getErrorMessage,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
