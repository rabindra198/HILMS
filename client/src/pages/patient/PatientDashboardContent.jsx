import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, FlaskConical, CreditCard, Stethoscope, ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { patientApi } from "@/services/patientApi";
import { toast } from "sonner";

const statCards = [
  { title: "Medical History", icon: Stethoscope, color: "text-teal", bg: "bg-teal-pale", href: "/patient/medical-history" },
  { title: "Prescriptions", icon: FileText, color: "text-coral-dark", bg: "bg-coral-pale", href: "/patient/prescriptions" },
  { title: "Lab Reports", icon: FlaskConical, color: "text-lavender", bg: "bg-lavender-pale", href: "/patient/laboratory-reports" },
  { title: "Payments", icon: CreditCard, color: "text-amber-600", bg: "bg-sand", href: "/patient/payments" },
];

export default function PatientDashboardContent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    consultations: [],
    prescriptions: [],
    labReports: [],
    followUps: [],
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [consultationsRes, prescriptionsRes, labReportsRes, followUpsRes] = await Promise.all([
          patientApi.getConsultations(),
          patientApi.getPrescriptions(),
          patientApi.getLabReports(),
          patientApi.getFollowUps(),
        ]);
        setData({
          consultations: consultationsRes.consultations || [],
          prescriptions: prescriptionsRes.prescriptions || [],
          labReports: labReportsRes.reports || [],
          followUps: followUpsRes.followUps || [],
        });
      } catch {
        toast.error("Unable to load dashboard data");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const recentConsultations = data.consultations.slice(0, 5);
  const recentPrescriptions = data.prescriptions.slice(0, 5);
  const recentLabReports = data.labReports.slice(0, 5);

  return (
    <div className="space-y-6">
      <Header title="Patient Dashboard" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Patient Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back! Here is your health overview.</p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card, i) => {
            const Icon = card.icon;
            let count = 0;
            if (i === 0) count = data.consultations.length;
            else if (i === 1) count = data.prescriptions.length;
            else if (i === 2) count = data.labReports.length;
            else if (i === 3) count = data.followUps.length;

            return (
              <Link key={i} to={card.href}>
                <div className="rounded-xl border border-border bg-card p-5 transition hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.title}</p>
                      <p className="text-2xl font-bold text-foreground">{count}</p>
                    </div>
                    <div className={`flex size-10 items-center justify-center rounded-xl ${card.bg}`}>
                      <Icon className={`size-5 ${card.color}`} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
          <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Medical History</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/patient/medical-history">
                  View All <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
            {recentConsultations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No consultations yet.</p>
            ) : (
              <div className="space-y-3">
                {recentConsultations.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.diagnosis || "General Consultation"}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""} • {c.status || "Completed"}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      c.status === "Completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {c.status || "Completed"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Lab Reports</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/patient/laboratory-reports">
                  View All <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
            {recentLabReports.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No lab reports yet.</p>
            ) : (
              <div className="space-y-3">
                {recentLabReports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.testName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.completedDate ? new Date(r.completedDate).toLocaleDateString() : r.requestedDate}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      r.status === "Completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Prescriptions</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/patient/prescriptions">
                  View All <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
            {recentPrescriptions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No prescriptions yet.</p>
            ) : (
              <div className="space-y-3">
                {recentPrescriptions.map((rx) => (
                  <div key={rx.id} className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{rx.diagnosis || "Prescription"}</p>
                      <p className="text-xs text-muted-foreground">
                        {rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : ""} • {(rx.medicines || []).length} medicine(s)
                      </p>
                    </div>
                    <FileText className="size-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Payments</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/patient/payments">
                  View All <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="py-8 text-center text-sm text-muted-foreground">Payment history coming soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}
