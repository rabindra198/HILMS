import { useEffect, useState } from "react";
import { FileText, Search, Eye } from "lucide-react";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Modal } from "@/components/doctor/Modal";
import { Input } from "@/components/ui/input";

export default function DoctorConsultationHistory() {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    doctorApi
      .getConsultations()
      .then((d) => setConsultations(d.consultations))
      .catch(() => setConsultations(fallbackDoctorData.consultations))
      .finally(() => setLoading(false));
  }, []);

  const filtered = consultations.filter(
    (c) =>
      (c.patient?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.diagnosis || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-teal-deep">Consultation History</h1>
        <p className="mt-1 text-sm text-ink-soft font-medium">Review previous consultations before new treatment decisions.</p>
      </div>

      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient or diagnosis..." className="pl-9" />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl border border-deept/10 bg-white" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-deept/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Diagnosis</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Clinical Notes</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-soft">No consultations found.</td></tr>}
              {filtered.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-softcream">
                  <td className="px-4 py-3 text-ink-soft">{(c.createdAt || c.created_at || "").slice(0, 10)}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{c.patient?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{c.diagnosis || "—"}</td>
                  <td className="px-4 py-3 text-ink-soft max-w-[260px] truncate">{c.clinicalNotes || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => setViewing(c)} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-mid hover:underline">
                      <Eye className="size-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Consultation Details" size="lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info label="Patient" value={viewing.patient?.name} />
              <Info label="Date" value={(viewing.createdAt || "").slice(0, 10)} />
              <Info label="Diagnosis" value={viewing.diagnosis} />
              <Info label="Status" value={viewing.status} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Clinical Notes</p>
              <p className="mt-1 text-sm text-ink-soft">{viewing.clinicalNotes || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Treatment Plan</p>
              <p className="mt-1 text-sm text-ink-soft">{viewing.treatmentPlan || "—"}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value || "—"}</p>
    </div>
  );
}
