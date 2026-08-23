import { FlaskConical, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockLabStats = [
  { title: "Pending Tests", value: "24", urgent: "4 urgent", icon: Clock, color: "orange" },
  { title: "Samples Collected", value: "42", urgent: "", icon: FlaskConical, color: "blue" },
  { title: "Processing", value: "12", urgent: "", icon: AlertCircle, color: "orange" },
  { title: "Completed Today", value: "38", urgent: "", icon: CheckCircle2, color: "green" },
];

const mockLabRequests = [
  { id: "REQ-001", patient: "John Doe", test: "Complete Blood Count", doctor: "Dr. Sharma", priority: "Normal", status: "Pending" },
  { id: "REQ-002", patient: "Aarav Thapa", test: "Blood Sugar", doctor: "Dr. Gurung", priority: "Urgent", status: "Processing" },
  { id: "REQ-003", patient: "Sita Rai", test: "Liver Function", doctor: "Dr. KC", priority: "Normal", status: "Completed" },
];

export default function LaboratoryPage() {
  return (
    <div className="space-y-6">
      <Header title="Laboratory" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Laboratory</h2>
          <p className="text-sm text-muted-foreground">View pending tests and track laboratory progress.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mockLabStats.map((stat) => (
          <div key={stat.title} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                {stat.urgent && <p className="text-xs text-red-600">{stat.urgent}</p>}
              </div>
              <div className={`flex size-10 items-center justify-center rounded-lg ${
                stat.color === "blue" ? "bg-blue-500/10 text-blue-600" :
                stat.color === "orange" ? "bg-orange-500/10 text-orange-600" :
                "bg-emerald-500/10 text-emerald-600"
              }`}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Recent Laboratory Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Request ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Test</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Doctor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockLabRequests.map((req) => (
                <tr key={req.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{req.id}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{req.patient}</td>
                  <td className="px-4 py-3 text-muted-foreground">{req.test}</td>
                  <td className="px-4 py-3 text-muted-foreground">{req.doctor}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} />
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
