import { Calendar, Clock, Users, CheckCircle2, Stethoscope, FlaskConical } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockSchedule = [
  { time: "09:00 AM", patient: "John Doe", type: "General Consultation", status: "Waiting" },
  { time: "09:30 AM", patient: "Sita Rai", type: "Follow-up", status: "In Consultation" },
  { time: "10:00 AM", patient: "Ram Thapa", type: "General Consultation", status: "Completed" },
  { time: "10:30 AM", patient: "Aarav Thapa", type: "New Visit", status: "Waiting" },
];

const mockQueue = [
  { token: "#05", patient: "Sita Thapa", time: "10:30 AM", reason: "Follow-up", waiting: "15 min", status: "Waiting" },
  { token: "#06", patient: "Hari Gurung", time: "11:00 AM", reason: "Consultation", waiting: "5 min", status: "Waiting" },
  { token: "#07", patient: "Maya Rai", time: "02:00 PM", reason: "New Visit", waiting: "45 min", status: "Scheduled" },
];

export default function DoctorDashboard() {
  return (
    <div className="space-y-6">
      <Header title="Doctor Dashboard" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Good Morning, Dr. Sharma</h1>
        <p className="text-sm text-muted-foreground">Here's your schedule for today.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Today's Patients" value="18" trend="8.2%" trendUp description="Today's schedule" icon={Users} color="blue" />
        <StatCard title="Pending Consultations" value="6" trend="2 new" trendUp={false} description="Awaiting attention" icon={Clock} color="orange" />
        <StatCard title="Completed Consultations" value="12" trend="75%" trendUp description="Of total appointments" icon={CheckCircle2} color="green" />
        <StatCard title="Lab Reports" value="5" trend="1 urgent" trendUp={false} description="Pending review" icon={FlaskConical} color="purple" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Today's Schedule</h2>
          <div className="space-y-3">
            {mockSchedule.map((apt, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-medium text-muted-foreground w-20">{apt.time}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{apt.patient}</p>
                    <p className="text-xs text-muted-foreground">{apt.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={apt.status} />
                  {apt.status === "Waiting" && (
                    <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                      Start
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Patient Queue</h2>
          <div className="space-y-3">
            {mockQueue.map((q, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {q.token}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{q.patient}</p>
                    <p className="text-xs text-muted-foreground">{q.time} • {q.reason} • {q.waiting} waiting</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={q.status} />
                  <button className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    Start Consultation
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
