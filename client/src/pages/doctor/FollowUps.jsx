import { Calendar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockFollowUps = [
  { id: "FU-001", patient: "John Doe", date: "2026-08-25", reason: "Post-surgery checkup", notes: "Monitor BP", status: "Scheduled" },
  { id: "FU-002", patient: "Sita Rai", date: "2026-08-24", reason: "Follow-up consultation", notes: "Review lab results", status: "Pending" },
];

export default function DoctorFollowUps() {
  return (
    <div className="space-y-6">
      <Header title="Follow-ups" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Follow-ups</h2>
          <p className="text-sm text-muted-foreground">Manage patient follow-up appointments.</p>
        </div>
        <Button>
          <Calendar className="mr-2 size-4" />
          Schedule Follow-up
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search follow-ups..." className="pl-9" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockFollowUps.map((fu) => (
              <tr key={fu.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{fu.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{fu.patient}</td>
                <td className="px-4 py-3 text-muted-foreground">{fu.date}</td>
                <td className="px-4 py-3 text-muted-foreground">{fu.reason}</td>
                <td className="px-4 py-3 text-muted-foreground">{fu.notes}</td>
                <td className="px-4 py-3"><StatusBadge status={fu.status} /></td>
                <td className="px-4 py-3">
                  <button className="text-sm font-medium text-primary hover:underline">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
