import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { patientApi } from "@/services/patientApi";
import { toast } from "sonner";
import { Loader2, FlaskConical } from "lucide-react";

export default function LaboratoryReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientApi
      .getLabReports()
      .then((res) => setReports(res.reports || []))
      .catch(() => toast.error("Unable to load lab reports"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRoute roles={["patient"]}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Laboratory Reports</h1>
            <p className="text-sm text-muted-foreground">Your test results and reports.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <FlaskConical className="mx-auto size-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No lab reports yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-foreground">{r.testName}</p>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      r.status === "Completed" || r.status === "Verified" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Requested: {r.requestedDate ? new Date(r.requestedDate).toLocaleDateString() : "—"}</p>
                    <p>Completed: {r.completedDate ? new Date(r.completedDate).toLocaleDateString() : "Pending"}</p>
                  </div>
                  {r.results && r.results.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pb-2 text-left font-medium text-muted-foreground">Test</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Result</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Reference Range</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.results.map((result, idx) => (
                            <tr key={idx} className="border-b border-border/50">
                              <td className="py-2 text-foreground">{result.test}</td>
                              <td className="py-2 text-foreground">{result.result}</td>
                              <td className="py-2 text-muted-foreground">{result.referenceRange || "—"}</td>
                              <td className="py-2">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  result.flag === "normal" ? "bg-emerald-50 text-emerald-700" : result.flag === "abnormal" ? "bg-coral-pale text-coral-dark" : "bg-sand text-ink-soft"
                                }`}>
                                  {result.flag || "—"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {r.comment && <p className="mt-3 text-xs text-muted-foreground">Doctor's Comment: {r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
