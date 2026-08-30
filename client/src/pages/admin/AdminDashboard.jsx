import { Users, Calendar, FlaskConical, CreditCard } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";

function AdminDashboardPage() {
  const stats = [
    { title: "Total Patients", value: "1,248", trend: "12.5%", trendUp: true, description: "Compared to last month", icon: Users, variant: "teal" },
    { title: "Today's Appointments", value: "86", trend: "8.2%", trendUp: true, description: "Today's schedule", icon: Calendar, variant: "lavender" },
    { title: "Pending Lab Tests", value: "24", trend: "4.5%", trendUp: false, description: "Awaiting results", icon: FlaskConical, variant: "sand" },
    { title: "Today's Revenue", value: "Rs. 84,500", trend: "15.8%", trendUp: true, description: "Compared to yesterday", icon: CreditCard, variant: "coral" },
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
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Dashboard
          </h1>
          <p className="text-base text-ink-soft font-medium">
            Here's what's happening in your hospital today.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
            <Users className="size-4" />
            Register Patient
          </button>
          <button className="inline-flex items-center gap-2 rounded-full border-2 border-teal/30 bg-cream px-5 py-2.5 text-sm font-semibold text-teal-deep hover:bg-teal-pale hover:border-teal-pale transition-all">
            <Calendar className="size-4" />
            New Appointment
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Tables */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Appointments Table */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-xl font-bold text-teal-deep mb-5">Today's Appointments</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-deept/10 bg-cream">
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Doctor</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Department</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Time</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deept/5">
                  {appointments.map((apt, i) => (
                    <tr key={i} className="transition-colors hover:bg-softcream">
                      <td className="px-3 py-3.5 font-semibold text-ink">{apt.patient}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{apt.doctor}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{apt.dept}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{apt.time}</td>
                      <td className="px-3 py-3.5">
                        <StatusBadge status={apt.status} />
                      </td>
                      <td className="px-3 py-3.5">
                        <button className="text-sm font-semibold text-teal-mid hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Patients Table */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-xl font-bold text-teal-deep mb-5">Recent Patients</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-deept/10 bg-cream">
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient ID</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Age</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Gender</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Phone</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Last Visit</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                    <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deept/5">
                  {recentPatients.map((patient, i) => (
                    <tr key={i} className="transition-colors hover:bg-softcream">
                      <td className="px-3 py-3.5 font-mono text-xs text-ink-soft">{patient.id}</td>
                      <td className="px-3 py-3.5 font-semibold text-ink">{patient.name}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{patient.age}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{patient.gender}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{patient.phone}</td>
                      <td className="px-3 py-3.5 text-ink-soft">{patient.lastVisit}</td>
                      <td className="px-3 py-3.5">
                        <StatusBadge status={patient.status} />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <button className="text-sm font-semibold text-teal-mid hover:underline">View</button>
                          <button className="text-sm font-semibold text-ink-soft hover:text-ink">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Widgets */}
        <div className="flex flex-col gap-6">
          {/* Laboratory Overview */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-xl font-bold text-teal-deep mb-5">Laboratory Overview</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border-2 border-deept/10 bg-white p-4">
                <p className="text-xs font-medium text-ink-soft">Pending Tests</p>
                <p className="font-heading text-2xl font-bold text-teal-deep mt-1">24</p>
              </div>
              <div className="rounded-xl border-2 border-deept/10 bg-white p-4">
                <p className="text-xs font-medium text-ink-soft">Processing</p>
                <p className="font-heading text-2xl font-bold text-teal-deep mt-1">12</p>
              </div>
              <div className="rounded-xl border-2 border-deept/10 bg-white p-4">
                <p className="text-xs font-medium text-ink-soft">Completed Today</p>
                <p className="font-heading text-2xl font-bold text-teal-deep mt-1">38</p>
              </div>
              <div className="rounded-xl border-2 border-deept/10 bg-white p-4">
                <p className="text-xs font-medium text-ink-soft">Urgent</p>
                <p className="font-heading text-2xl font-bold text-coral-dark mt-1">4</p>
              </div>
            </div>
          </div>

          {/* Revenue Summary */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-xl font-bold text-teal-deep mb-5">Revenue Summary</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-soft">Consultation Fees</span>
                <span className="text-sm font-bold text-ink">Rs. 45,000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-soft">Laboratory Fees</span>
                <span className="text-sm font-bold text-ink">Rs. 28,500</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-soft">Medicines</span>
                <span className="text-sm font-bold text-ink">Rs. 11,000</span>
              </div>
              <div className="border-t-2 border-deept/10 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-ink">Total Revenue</span>
                  <span className="font-heading text-xl font-extrabold text-teal-deep">Rs. 84,500</span>
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
