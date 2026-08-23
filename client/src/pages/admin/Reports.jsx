import { FileText, Calendar, Users, FlaskConical, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/Header";

const reports = [
  { title: "Patient Reports", description: "New, returning, and demographic insights", icon: Users },
  { title: "Appointment Reports", description: "Daily, weekly, and monthly trends", icon: Calendar },
  { title: "Laboratory Reports", description: "Test volume and turnaround times", icon: FlaskConical },
  { title: "Revenue Reports", description: "Consultation, lab, and total revenue", icon: TrendingUp },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <Header title="Reports" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reports</h2>
          <p className="text-sm text-muted-foreground">Generate and view hospital reports.</p>
        </div>
        <Button variant="outline">Export</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <button
            key={report.title}
            className="rounded-xl border border-border bg-card p-6 text-left transition-colors hover:bg-muted/50"
          >
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <report.icon className="size-5" />
            </div>
            <h3 className="font-semibold text-foreground">{report.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
