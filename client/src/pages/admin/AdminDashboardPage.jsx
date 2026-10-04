import { Outlet } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ROLES } from "@/lib/roles";

/**
 * Admin area. Guarded by ProtectedRoute and, independently, by `isAdmin` on
 * every /api/admin endpoint, so a stale or hand-edited token cannot get in.
 */
export default function AdminDashboardPage() {
  return (
    <ProtectedRoute roles={[ROLES.ADMIN]}>
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
