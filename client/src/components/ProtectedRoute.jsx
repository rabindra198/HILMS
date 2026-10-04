import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ACCOUNT_STATUSES, normalizeRole, getRoleHome } from "@/lib/roles";
import { FullPageLoader } from "@/components/common/LoadingSkeleton";

/**
 * Frontend route guard.
 *
 * This is a UX convenience only - it prevents flicker and wrong-role screens.
 * It is NOT a security boundary: every protected API call is independently
 * authorised by the backend, and the backend re-reads the account status on
 * each request. A tampered client cannot gain access through this component.
 */
export const ProtectedRoute = ({ children, roles }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Mirrors the backend gate: a non-approved account never reaches a dashboard.
  if (user.status !== ACCOUNT_STATUSES.APPROVED) {
    return <Navigate to="/login" replace state={{ reason: user.status }} />;
  }

  // A freshly approved Doctor / Laboratory account is confined to the forced
  // password change until the temporary password has been replaced. The
  // backend refuses these same routes with 403, so this is only a redirect.
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace state={{ from: location.pathname }} />;
  }

  if (roles && roles.length > 0) {
    const allowed = roles.map(normalizeRole);
    if (!allowed.includes(normalizeRole(user.role))) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
};

/**
 * Sends an already-authenticated user to their own dashboard instead of
 * showing the login / request-access screens again.
 */
export const PublicOnlyRoute = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader />;

  if (isAuthenticated && user?.status === ACCOUNT_STATUSES.APPROVED) {
    // An account holding a temporary password must resolve it first, even
    // though it is otherwise fully approved.
    if (user.mustChangePassword) {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return children;
};

/**
 * Guards the first-login change-password screen itself.
 *
 * Requires a valid session (the login with the temporary password already
 * issued one) and bounces away anyone who does not need the change, so the
 * page cannot be used as a generic password editor.
 */
export const ChangePasswordRoute = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader />;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.mustChangePassword) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return children;
};
