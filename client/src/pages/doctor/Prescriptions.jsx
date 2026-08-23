import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockPrescriptions = [
  { id: "RX-001", patient: "John Doe", date: "2026-08-23", medicines: "Paracetamol, Amoxicillin", status: "Active" },
  { id: "RX-002", patient: "Sita Rai", date: "2026-08-22", medicines: "Cetirizine", status: "Completed" },
];

export default function DoctorPrescriptions() {
  return (
    <div className="space-y-6">
      <Header title="Prescriptions" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Prescriptions</h2>
          <p className="text-sm text-muted-foreground">Manage patient prescriptions.</p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          New Prescription
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Medicines</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockPrescriptions.map((rx) => (
              <tr key={rx.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{rx.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{rx.patient}</td>
                <td className="px-4 py-3 text-muted-foreground">{rx.date}</td>
                <td className="px-4 py-3 text-muted-foreground">{rx.medicines}</td>
                <td className="px-4 py-3"><StatusBadge status={rx.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button className="text-sm font-medium text-primary hover:underline">View</button>
                    <button className="text-sm font-medium text-muted-foreground hover:text-foreground">Print</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
