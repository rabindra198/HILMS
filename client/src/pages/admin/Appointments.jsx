import { useState } from "react";
import { Search, Plus, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockAppointments = [
  { id: "APT-001", patient: "John Doe", doctor: "Dr. Sharma", dept: "Cardiology", date: "2026-08-23", time: "10:30 AM", type: "Follow-up", status: "Confirmed" },
  { id: "APT-002", patient: "Aarav Thapa", doctor: "Dr. Gurung", dept: "General Medicine", date: "2026-08-23", time: "11:00 AM", type: "New", status: "Waiting" },
  { id: "APT-003", patient: "Sita Rai", doctor: "Dr. KC", dept: "Dermatology", date: "2026-08-23", time: "11:30 AM", type: "Consultation", status: "Completed" },
  { id: "APT-004", patient: "Ram Thapa", doctor: "Dr. Sharma", dept: "Cardiology", date: "2026-08-23", time: "12:00 PM", type: "Follow-up", status: "Confirmed" },
];

export default function AppointmentsPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <Header title="Appointments" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Appointments</h2>
          <p className="text-sm text-muted-foreground">Manage and schedule appointments.</p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          New Appointment
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search appointments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Appointment ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Doctor</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Department</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockAppointments.map((apt) => (
              <tr key={apt.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{apt.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{apt.patient}</td>
                <td className="px-4 py-3 text-muted-foreground">{apt.doctor}</td>
                <td className="px-4 py-3 text-muted-foreground">{apt.dept}</td>
                <td className="px-4 py-3 text-muted-foreground">{apt.date}</td>
                <td className="px-4 py-3 text-muted-foreground">{apt.time}</td>
                <td className="px-4 py-3 text-muted-foreground">{apt.type}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={apt.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="rounded p-1.5 hover:bg-muted" title="View"><Eye className="size-4 text-muted-foreground" /></button>
                    <button className="rounded p-1.5 hover:bg-muted" title="Edit"><Edit className="size-4 text-muted-foreground" /></button>
                    <button className="rounded p-1.5 hover:bg-muted" title="Cancel"><Trash2 className="size-4 text-destructive" /></button>
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
