import { Calendar, FileText, FlaskConical, CreditCard } from "lucide-react";
import { Header } from "@/components/layout/Header";

const mockPatientData = {
  upcomingAppointments: [
    { id: "APT-001", doctor: "Dr. Adhikari", dept: "Cardiology", date: "2026-08-25", time: "09:00 AM" },
  ],
  recentPrescriptions: [
    { id: "RX-001", doctor: "Dr. Adhikari", date: "2026-08-20", medicines: "Paracetamol, Amoxicillin" },
  ],
  labReports: [
    { id: "LAB-001", test: "CBC", date: "2026-08-20", status: "Completed" },
  ],
  payments: [
    { id: "PAY-001", invoice: "INV-001", amount: "Rs. 1,500", date: "2026-08-20", status: "Paid" },
  ],
};

export default function PatientDashboardContent() {
  return (
    <div className="space-y-6">
      <Header title="Patient Dashboard" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Patient Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back! Here is your health overview.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Upcoming Appointments</p>
              <p className="text-2xl font-bold text-foreground">{mockPatientData.upcomingAppointments.length}</p>
            </div>
            <Calendar className="size-8 text-blue-600" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Prescriptions</p>
              <p className="text-2xl font-bold text-foreground">{mockPatientData.recentPrescriptions.length}</p>
            </div>
            <FileText className="size-8 text-green-600" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Lab Reports</p>
              <p className="text-2xl font-bold text-foreground">{mockPatientData.labReports.length}</p>
            </div>
            <FlaskConical className="size-8 text-orange-600" />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Payments</p>
              <p className="text-2xl font-bold text-foreground">{mockPatientData.payments.length}</p>
            </div>
            <CreditCard className="size-8 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Upcoming Appointments</h2>
          <div className="space-y-3">
            {mockPatientData.upcomingAppointments.map((apt, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{apt.doctor}</p>
                  <p className="text-xs text-muted-foreground">{apt.dept} • {apt.date} at {apt.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Lab Reports</h2>
          <div className="space-y-3">
            {mockPatientData.labReports.map((report, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{report.test}</p>
                  <p className="text-xs text-muted-foreground">{report.date}</p>
                </div>
                <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                  {report.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
