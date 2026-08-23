import { Calendar, Clock, Users, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockSchedule = [
  { time: "09:00 AM", patient: "John Doe", type: "General Consultation", status: "Waiting" },
  { time: "09:30 AM", patient: "Sita Rai", type: "Follow-up", status: "In Consultation" },
  { time: "10:00 AM", patient: "Ram Thapa", type: "General Consultation", status: "Completed" },
  { time: "10:30 AM", patient: "Aarav Thapa", type: "New Visit", status: "Waiting" },
];

export default function DoctorAppointments() {
  return (
    <div className="space-y-6">
      <Header title="Appointments" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">My Appointments</h2>
          <p className="text-sm text-muted-foreground">View and manage your appointments.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Today's Appointments" value="18" trend="8.2%" trendUp description="Today's schedule" icon={Calendar} color="blue" />
        <StatCard title="Pending" value="6" trend="2 urgent" trendUp={false} description="Awaiting consultation" icon={Clock} color="orange" />
        <StatCard title="Completed" value="12" trend="75%" trendUp description="Completion rate" icon={CheckCircle2} color="green" />
        <StatCard title="Total Patients" value="248" trend="12%" trendUp description="This month" icon={Users} color="purple" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockSchedule.map((apt, i) => (
                <tr key={i} className="transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium text-foreground">{apt.time}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{apt.patient}</td>
                  <td className="px-4 py-3 text-muted-foreground">{apt.type}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={apt.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-sm font-medium text-primary hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
