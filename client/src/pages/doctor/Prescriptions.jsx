import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Printer, Eye } from "lucide-react";
import { toast } from "sonner";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PrescriptionForm } from "@/components/doctor/PrescriptionForm";
import { Modal } from "@/components/doctor/Modal";

export default function DoctorPrescriptions() {
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    doctorApi
      .getPrescriptions()
      .then((d) => setPrescriptions(d.prescriptions))
      .catch(() => setPrescriptions(fallbackDoctorData.prescriptions))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = (rx) => {
    const content = `
      <h1>HILMS</h1>
      <p>Hospital Information & Laboratory Management System</p>
      <h3>Prescription — ${rx.patient?.name}</h3>
      <p>Diagnosis: ${rx.diagnosis}</p>
      <table>
        <tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr>
        ${(rx.medicines || []).map((m) => `<tr><td>${m.name}</td><td>${m.dosage}</td><td>${m.frequency}</td><td>${m.duration}</td><td>${m.instructions || ""}</td></tr>`).join("")}
      </table>
    `;
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Prescription</title><style>body{font-family:Arial;padding:40px;color:#1a202c}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left}</style></head><body>${content}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    toast.success("Print dialog opened for prescription");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-teal-deep">Prescriptions</h1>
          <p className="mt-1 text-sm text-ink-soft font-medium">Manage patient prescriptions.</p>
        </div>
        <PrescriptionForm onSaved={() => doctorApi.getPrescriptions().then((d) => setPrescriptions(d.prescriptions)).catch(() => {})} />
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-deept/10 bg-white" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-deept/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">ID</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Diagnosis</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Medicines</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {prescriptions.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-soft">No prescriptions yet.</td></tr>
              )}
              {prescriptions.map((rx) => (
                <tr key={rx.id} className="transition-colors hover:bg-softcream">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-teal-mid">{rx.id}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{rx.patient?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{(rx.createdAt || rx.created_at || "").slice(0, 10)}</td>
                  <td className="px-4 py-3 text-ink-soft">{rx.diagnosis}</td>
                  <td className="px-4 py-3 text-ink-soft">{(rx.medicines || []).map((m) => m.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status="Active" /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setViewing(rx)} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-mid hover:underline">
                        <Eye className="size-3.5" /> View
                      </button>
                      <button onClick={() => handlePrint(rx)} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
                        <Printer className="size-3.5" /> Print
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Prescription Details" size="lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between border-b border-deept/10 pb-4">
              <div>
                <p className="font-heading text-xl font-extrabold text-teal-deep">HILMS</p>
                <p className="text-xs text-ink-soft">Hospital Information & Laboratory Management System</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-ink">{viewing.patient?.name}</p>
                <p className="text-xs text-ink-soft">Age: {viewing.patient?.age} · Gender: {viewing.patient?.gender}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Diagnosis</p>
              <p className="mt-1 text-sm text-ink-soft">{viewing.diagnosis || "—"}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Medicines</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-deept/10 text-left">
                    <th className="py-1.5 pr-2 font-semibold text-ink-soft">Medicine</th>
                    <th className="py-1.5 pr-2 font-semibold text-ink-soft">Dosage</th>
                    <th className="py-1.5 pr-2 font-semibold text-ink-soft">Frequency</th>
                    <th className="py-1.5 pr-2 font-semibold text-ink-soft">Duration</th>
                    <th className="py-1.5 font-semibold text-ink-soft">Instructions</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.medicines || []).map((m, i) => (
                    <tr key={i} className="border-b border-deept/5">
                      <td className="py-2 pr-2 font-medium text-ink">{m.name}</td>
                      <td className="py-2 pr-2 text-ink-soft">{m.dosage}</td>
                      <td className="py-2 pr-2 text-ink-soft">{m.frequency}</td>
                      <td className="py-2 pr-2 text-ink-soft">{m.duration}</td>
                      <td className="py-2 text-ink-soft">{m.instructions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setViewing(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-deept/10 px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-cream">
                Close
              </button>
              <button onClick={() => { handlePrint(viewing); setViewing(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
                <Printer className="size-4" /> Print / PDF
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
