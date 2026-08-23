import { FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockReports = [
  { id: "LAB-001", patient: "John Doe", test: "Complete Blood Count", date: "2026-08-23", status: "Completed" },
  { id: "LAB-002", patient: "Sita Rai", test: "Blood Sugar", date: "2026-08-23", status: "Processing" },
  { id: "LAB-003", patient: "Ram Thapa", test: "Liver Function", date: "2026-08-22", status: "Verified" },
];

export default function DoctorLabReports() {
  return (
    <div className="space-y-6">
      <Header title="Laboratory Reports" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Lab Reports</h2>
          <p className="text-sm text-muted-foreground">View and review laboratory reports.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search reports..." className="pl-9" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Report ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Test</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockReports.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{r.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{r.patient}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.test}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button className="text-sm font-medium text-primary hover:underline">View</button>
                    <button className="text-sm font-medium text-muted-foreground hover:text-foreground">Compare</button>
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
