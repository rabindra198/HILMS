import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { patientApi } from "@/services/patientApi";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";

export default function MedicalHistoryPage() {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientApi
      .getConsultations()
      .then((res) => setConsultations(res.consultations || []))
      .catch(() => toast.error("Unable to load medical history"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRoute roles={["patient"]}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Medical History</h1>
            <p className="text-sm text-muted-foreground">Your past consultations and diagnoses.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : consultations.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <FileText className="mx-auto size-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No medical history found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {consultations.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      c.status === "Completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  {c.diagnosis && <p className="text-sm font-semibold text-foreground mb-1">Diagnosis: {c.diagnosis}</p>}
                  {c.clinicalNotes && <p className="text-sm text-muted-foreground mb-1">{c.clinicalNotes}</p>}
                  {c.treatmentPlan && <p className="text-sm text-muted-foreground">Treatment: {c.treatmentPlan}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
