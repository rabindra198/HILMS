import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CreditCard } from "lucide-react";

export default function PaymentsPage() {
  return (
    <ProtectedRoute roles={["patient"]}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payments</h1>
            <p className="text-sm text-muted-foreground">Your billing and payment history.</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <CreditCard className="mx-auto size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Payment history coming soon.</p>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
