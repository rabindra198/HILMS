import { FlaskConical, Clock, CheckCircle2, AlertCircle, Plus, Search } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";

const mockLabStats = [
  { title: "Pending Tests", value: "24", subtitle: "4 urgent", icon: Clock, variant: "coral" },
  { title: "Samples Collected", value: "42", subtitle: "", icon: FlaskConical, variant: "lavender" },
  { title: "Processing", value: "12", subtitle: "", icon: AlertCircle, variant: "sand" },
  { title: "Completed Today", value: "38", subtitle: "", icon: CheckCircle2, variant: "teal" },
];

const mockLabRequests = [
  { id: "REQ-001", patient: "John Doe", test: "Complete Blood Count", doctor: "Dr. Sharma", priority: "Normal", status: "Pending" },
  { id: "REQ-002", patient: "Aarav Thapa", test: "Blood Sugar", doctor: "Dr. Gurung", priority: "Urgent", status: "Processing" },
  { id: "REQ-003", patient: "Sita Rai", test: "Liver Function", doctor: "Dr. KC", priority: "Normal", status: "Completed" },
  { id: "REQ-004", patient: "Ram Thapa", test: "Kidney Function", doctor: "Dr. Sharma", priority: "High", status: "Pending" },
];

export default function LaboratoryPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Laboratory
          </h1>
          <p className="text-base text-ink-soft font-medium">
            View pending tests and track laboratory progress.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
          <Plus className="size-4" />
          New Test Request
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mockLabStats.map((stat) => {
          const iconColors = {
            teal: "bg-teal-mid/15 text-teal-mid",
            lavender: "bg-lavender/30 text-lavender",
            coral: "bg-coral/20 text-coral-dark",
            sand: "bg-coral/15 text-coral-dark",
          };
          return (
            <div key={stat.title} className="rounded-2xl border border-deept/5 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-soft">{stat.title}</p>
                  <p className="font-heading text-2xl font-bold text-teal-deep">{stat.value}</p>
                  {stat.subtitle && <p className="text-xs font-medium text-coral-dark mt-1">{stat.subtitle}</p>}
                </div>
                <div className={`flex size-10 items-center justify-center rounded-xl ${iconColors[stat.variant]}`}>
                  <stat.icon className="size-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            placeholder="Search by patient, test, or ID..."
            className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
          />
        </div>
      </div>

      {/* Lab Requests Table */}
      <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-deept/10 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-teal-deep">Recent Laboratory Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream/50">
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Request ID</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Test</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Doctor</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Priority</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {mockLabRequests.map((req) => (
                <tr key={req.id} className="transition-colors hover:bg-teal-pale/30">
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{req.id}</td>
                  <td className="px-5 py-4 font-semibold text-ink">{req.patient}</td>
                  <td className="px-5 py-4 text-ink-soft">{req.test}</td>
                  <td className="px-5 py-4 text-ink-soft">{req.doctor}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={req.priority} />
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-5 py-4">
                    <button className="text-sm font-semibold text-teal-mid hover:underline">View</button>
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
