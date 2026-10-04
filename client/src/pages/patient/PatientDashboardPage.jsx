import { Outlet } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ROLES } from "@/lib/roles";

export default function PatientDashboardPage() {
  return (
    <ProtectedRoute roles={[ROLES.PATIENT]}>
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </ProtectedRoute>
  );
}
