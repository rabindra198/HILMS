import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { patientApi } from "@/services/patientApi";
import { toast } from "sonner";
import { Loader2, FileText, Printer } from "lucide-react";

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientApi
      .getPrescriptions()
      .then((res) => setPrescriptions(res.prescriptions || []))
      .catch(() => toast.error("Unable to load prescriptions"))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = (rx) => {
    const content = `
      <h1>HILMS</h1>
      <p>Hospital Information & Laboratory Management System</p>
      <h3>Prescription</h3>
      <p><strong>Diagnosis:</strong> ${rx.diagnosis || "—"}</p>
      <table>
        <tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr>
        ${(rx.medicines || []).map((m) => `<tr><td>${m.name}</td><td>${m.dosage}</td><td>${m.frequency}</td><td>${m.duration}</td><td>${m.instructions || ""}</td></tr>`).join("")}
      </table>
      ${rx.notes ? `<p><strong>Notes:</strong> ${rx.notes}</p>` : ""}
    `;
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Prescription</title><style>body{font-family:Arial;padding:40px;color:#1a1a1c}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left}</style></head><body>${content}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <ProtectedRoute roles={["patient"]}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Prescriptions</h1>
            <p className="text-sm text-muted-foreground">Your prescribed medications.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <FileText className="mx-auto size-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No prescriptions yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {rx.createdAt ? new Date(rx.createdAt).toLocaleDateString() : "—"}
                      </p>
                      {rx.diagnosis && <p className="text-xs text-muted-foreground">{rx.diagnosis}</p>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handlePrint(rx)}>
                      <Printer className="size-4 mr-1" /> Print
                    </Button>
                  </div>
                  {rx.medicines && rx.medicines.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="pb-2 text-left font-medium text-muted-foreground">Medicine</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Dosage</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Frequency</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Duration</th>
                            <th className="pb-2 text-left font-medium text-muted-foreground">Instructions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rx.medicines.map((m, idx) => (
                            <tr key={idx} className="border-b border-border/50">
                              <td className="py-2 text-foreground">{m.name}</td>
                              <td className="py-2 text-muted-foreground">{m.dosage}</td>
                              <td className="py-2 text-muted-foreground">{m.frequency}</td>
                              <td className="py-2 text-muted-foreground">{m.duration}</td>
                              <td className="py-2 text-muted-foreground">{m.instructions || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {rx.notes && <p className="mt-3 text-xs text-muted-foreground">Notes: {rx.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
