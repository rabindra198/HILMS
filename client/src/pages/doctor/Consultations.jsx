import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockConsultations = [
  { id: "CON-001", patient: "John Doe", date: "2026-08-23", diagnosis: "Hypertension", notes: "Prescribed medication", status: "Completed" },
  { id: "CON-002", patient: "Sita Rai", date: "2026-08-23", diagnosis: "Skin Allergy", notes: "Refer to dermatologist", status: "Pending" },
];

export default function DoctorConsultations() {
  return (
    <div className="space-y-6">
      <Header title="Consultations" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Consultations</h2>
          <p className="text-sm text-muted-foreground">View and manage patient consultations.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search consultations..." className="pl-9" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Diagnosis</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockConsultations.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{c.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{c.patient}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.date}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.diagnosis}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.notes}</td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm">View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
