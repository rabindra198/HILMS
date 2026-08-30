import { FileText, Calendar, Users, FlaskConical, TrendingUp, Download, BarChart3 } from "lucide-react";

const reports = [
  { title: "Patient Reports", description: "New, returning, and demographic insights", icon: Users, color: "teal" },
  { title: "Appointment Reports", description: "Daily, weekly, and monthly trends", icon: Calendar, color: "lavender" },
  { title: "Laboratory Reports", description: "Test volume and turnaround times", icon: FlaskConical, color: "coral" },
  { title: "Revenue Reports", description: "Consultation, lab, and total revenue", icon: TrendingUp, color: "sand" },
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Reports
          </h1>
          <p className="text-base text-ink-soft font-medium">
            Generate and view hospital reports.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
          <Download className="size-4" />
          Export All
        </button>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reports.map((report) => {
          const colorMap = {
            teal: "bg-teal-pale border-teal-pale",
            lavender: "bg-lavender-pale border-lavender-pale",
            coral: "bg-coral-pale border-coral-pale",
            sand: "bg-sand border-sand",
          };
          const iconColorMap = {
            teal: "bg-teal-mid/15 text-teal-mid",
            lavender: "bg-lavender/30 text-lavender",
            coral: "bg-coral/20 text-coral-dark",
            sand: "bg-coral/15 text-coral-dark",
          };
          return (
            <button
              key={report.title}
              className={`rounded-2xl border-2 ${colorMap[report.color]} p-6 text-left transition-all hover:shadow-md hover:-translate-y-0.5`}
            >
              <div className={`mb-4 flex size-12 items-center justify-center rounded-xl ${iconColorMap[report.color]}`}>
                <report.icon className="size-6" />
              </div>
              <h3 className="font-heading text-base font-bold text-teal-deep">{report.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{report.description}</p>
            </button>
          );
        })}
      </div>

      {/* Report Chart Placeholder */}
      <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-xl font-bold text-teal-deep">Analytics Overview</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-pale px-3 py-1 text-xs font-semibold text-teal-mid">Weekly</span>
            <span className="rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink-soft">Monthly</span>
            <span className="rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink-soft">Yearly</span>
          </div>
        </div>
        <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-deept/10 bg-cream/30">
          <div className="text-center">
            <BarChart3 className="mx-auto size-12 text-ink-soft opacity-50" />
            <p className="mt-3 text-sm font-medium text-ink-soft">Chart visualization will appear here</p>
            <p className="text-xs text-ink-soft opacity-70">Connect to backend data to view analytics</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <h3 className="font-heading text-base font-bold text-teal-deep mb-4">This Month</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Total Patients</span>
              <span className="font-heading text-lg font-bold text-teal-deep">3,456</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Appointments</span>
              <span className="font-heading text-lg font-bold text-teal-deep">1,234</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Revenue</span>
              <span className="font-heading text-lg font-bold text-teal-deep">Rs. 2.4M</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <h3 className="font-heading text-base font-bold text-teal-deep mb-4">Last Month</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Total Patients</span>
              <span className="font-heading text-lg font-bold text-teal-deep">3,128</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Appointments</span>
              <span className="font-heading text-lg font-bold text-teal-deep">1,156</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Revenue</span>
              <span className="font-heading text-lg font-bold text-teal-deep">Rs. 2.1M</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <h3 className="font-heading text-base font-bold text-teal-deep mb-4">Growth</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Patients</span>
              <span className="font-heading text-lg font-bold text-teal-mid">+10.5%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Appointments</span>
              <span className="font-heading text-lg font-bold text-teal-mid">+6.7%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-soft">Revenue</span>
              <span className="font-heading text-lg font-bold text-teal-mid">+14.3%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
