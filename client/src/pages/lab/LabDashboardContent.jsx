import { FlaskConical, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Header } from "@/components/layout/Header";

const mockLabStats = [
  { title: "Pending Tests", value: "24", urgent: "4 urgent", icon: Clock, color: "orange" },
  { title: "Samples Collected", value: "42", urgent: "", icon: FlaskConical, color: "blue" },
  { title: "Processing", value: "12", urgent: "", icon: AlertCircle, color: "orange" },
  { title: "Completed Today", value: "38", urgent: "", icon: CheckCircle2, color: "green" },
];

export default function LabDashboardContent() {
  return (
    <div className="space-y-6">
      <Header title="Laboratory Dashboard" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laboratory Dashboard</h1>
        <p className="text-sm text-muted-foreground">Monitor laboratory workflow and reports.</p>
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

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Lab Requests</h2>
        <p className="text-sm text-muted-foreground">No lab requests available yet.</p>
      </div>
    </div>
  );
}
