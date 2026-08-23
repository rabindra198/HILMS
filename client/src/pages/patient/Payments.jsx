import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function PaymentsPage() {
  return (
    <ProtectedRoute roles={[""]}>
      <DashboardLayout>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-muted-foreground">This page is under development.</p>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
