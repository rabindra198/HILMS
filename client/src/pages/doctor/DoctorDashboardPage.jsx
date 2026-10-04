import { Outlet } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ROLES } from "@/lib/roles";

export default function DoctorDashboardPage() {
  return (
    <ProtectedRoute roles={[ROLES.DOCTOR]}>
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
