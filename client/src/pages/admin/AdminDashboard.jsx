import { HeartPulse, Users, Calendar, FlaskConical, CreditCard } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";

function AdminDashboardPage() {
  const stats = [
    { title: "Total Patients", value: "1,248", trend: "12.5%", trendUp: true, description: "Compared to last month", icon: Users, color: "blue" },
    { title: "Today's Appointments", value: "86", trend: "8.2%", trendUp: true, description: "Today's schedule", icon: Calendar, color: "green" },
    { title: "Pending Lab Tests", value: "24", trend: "4.5%", trendUp: false, description: "Awaiting results", icon: FlaskConical, color: "orange" },
    { title: "Today's Revenue", value: "Rs. 84,500", trend: "15.8%", trendUp: true, description: "Compared to yesterday", icon: CreditCard, color: "purple" },
  ];

  const appointments = [
    { patient: "John Doe", doctor: "Dr. Sharma", dept: "Cardiology", time: "10:30 AM", status: "Confirmed" },
    { patient: "Aarav Thapa", doctor: "Dr. Gurung", dept: "General Medicine", time: "11:00 AM", status: "Waiting" },
    { patient: "Sita Rai", doctor: "Dr. KC", dept: "Dermatology", time: "11:30 AM", status: "Completed" },
    { patient: "Ram Thapa", doctor: "Dr. Sharma", dept: "Cardiology", time: "12:00 PM", status: "Confirmed" },
  ];

  const recentPatients = [
    { id: "P-1024", name: "Raj Sharma", age: 28, gender: "Male", phone: "98XXXXXXXX", lastVisit: "Today", status: "Active" },
    { id: "P-1025", name: "Sita Thapa", age: 34, gender: "Female", phone: "97XXXXXXXX", lastVisit: "Yesterday", status: "Active" },
    { id: "P-1026", name: "Hari Gurung", age: 45, gender: "Male", phone: "96XXXXXXXX", lastVisit: "Today", status: "Active" },
  ];

  return (
    <div className="dashboard-shell space-y-6">
      <div className="dashboard-hero flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Here's what's happening in your hospital today.</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Users className="size-4" />
            Register Patient
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
            <Calendar className="size-4" />
            New Appointment
          </button>
        </div>
      </div>

      <div className="dashboard-stat-grid grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="dashboard-panel rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Today's Appointments</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Doctor</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Department</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Time</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {appointments.map((apt, i) => (
                    <tr key={i} className="transition-colors hover:bg-muted/50">
                      <td className="py-3 font-medium text-foreground">{apt.patient}</td>
                      <td className="py-3 text-muted-foreground">{apt.doctor}</td>
                      <td className="py-3 text-muted-foreground">{apt.dept}</td>
                      <td className="py-3 text-muted-foreground">{apt.time}</td>
                      <td className="py-3">
                        <StatusBadge status={apt.status} />
                      </td>
                      <td className="py-3">
                        <button className="text-sm font-medium text-primary hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-panel rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Recent Patients</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient ID</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Age</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Gender</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Visit</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="pb-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentPatients.map((patient, i) => (
                    <tr key={i} className="transition-colors hover:bg-muted/50">
                      <td className="py-3 font-mono text-xs text-muted-foreground">{patient.id}</td>
                      <td className="py-3 font-medium text-foreground">{patient.name}</td>
                      <td className="py-3 text-muted-foreground">{patient.age}</td>
                      <td className="py-3 text-muted-foreground">{patient.gender}</td>
                      <td className="py-3 text-muted-foreground">{patient.phone}</td>
                      <td className="py-3 text-muted-foreground">{patient.lastVisit}</td>
                      <td className="py-3">
                        <StatusBadge status={patient.status} />
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button className="text-sm font-medium text-primary hover:underline">View</button>
                          <button className="text-sm font-medium text-muted-foreground hover:text-foreground">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="dashboard-panel rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Laboratory Overview</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="dashboard-mini-card rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Pending Tests</p>
                <p className="text-xl font-bold text-foreground">24</p>
              </div>
              <div className="dashboard-mini-card rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Processing</p>
                <p className="text-xl font-bold text-foreground">12</p>
              </div>
              <div className="dashboard-mini-card rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Completed Today</p>
                <p className="text-xl font-bold text-foreground">38</p>
              </div>
              <div className="dashboard-mini-card rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Urgent</p>
                <p className="text-xl font-bold text-red-600">4</p>
              </div>
            </div>
          </div>

          <div className="dashboard-panel rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Revenue Summary</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Consultation Fees</span>
                <span className="text-sm font-semibold text-foreground">Rs. 45,000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Laboratory Fees</span>
                <span className="text-sm font-semibold text-foreground">Rs. 28,500</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Medicines</span>
                <span className="text-sm font-semibold text-foreground">Rs. 11,000</span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Total Revenue</span>
                  <span className="text-lg font-bold text-foreground">Rs. 84,500</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return <AdminDashboardPage />;
}
