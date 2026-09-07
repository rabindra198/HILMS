import { useEffect, useState } from "react";
import { Search, Users, Phone, Droplets, AlertTriangle } from "lucide-react";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { Modal } from "@/components/doctor/Modal";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";

export default function DoctorPatients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    doctorApi
      .getPatients()
      .then((d) => setPatients(d.patients))
      .catch(() => setPatients(fallbackDoctorData.patients))
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) => {
    const term = search.toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(term) ||
      (p.patientId || "").toLowerCase().includes(term) ||
      (p.phone || "").toLowerCase().includes(term)
    );
  });

  const detail = patientTabs(selected);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-teal-deep">My Patients</h1>
        <p className="mt-1 text-sm text-ink-soft font-medium">View and manage your assigned patients.</p>
      </div>

      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID, or phone..." className="pl-9" />
      </div>

      {loading ? (
        <div className="grid gap-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-deept/10 bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="rounded-2xl border border-deept/10 bg-white p-5 text-left shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-teal-pale text-teal-mid">
                <Users className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{p.name}</p>
                <p className="text-xs text-ink-soft">{p.patientId || p.id}</p>
              </div>
              <StatusBadge status="Active" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-1.5 text-ink-soft"><Users className="size-3.5" /> {p.age} · {p.gender}</div>
              <div className="flex items-center gap-1.5 text-ink-soft"><Droplets className="size-3.5" /> {p.bloodGroup || "—"}</div>
              <div className="flex items-center gap-1.5 text-ink-soft col-span-2"><Phone className="size-3.5" /> {p.phone || "—"}</div>
            </div>
            {(p.allergies || []).length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-coral-pale px-2.5 py-1.5 text-xs font-medium text-coral-dark">
                <AlertTriangle className="size-3.5" /> Allergies: {p.allergies.join(", ")}
              </div>
            )}
          </button>
        ))}
        {filtered.length === 0 && !loading && (
          <p className="col-span-full py-8 text-center text-sm text-ink-soft">No patients found.</p>
        )}
      </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Patient Profile" size="lg">
        {selected && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info label="Name" value={selected.name} />
              <Info label="Patient ID" value={selected.patientId} />
              <Info label="Age" value={selected.age} />
              <Info label="Gender" value={selected.gender} />
              <Info label="Blood Group" value={selected.bloodGroup} />
              <Info label="Phone" value={selected.phone} />
              <Info label="Allergies" value={(selected.allergies || []).join(", ") || "None"} highlight={(selected.allergies || []).length > 0} />
              <Info label="Conditions" value={(selected.conditions || []).join(", ") || "None"} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink mb-2">Recent History</p>
              <div className="flex flex-col divide-y divide-deept/5">
                {detail.map((item) => (
                  <div key={item.label} className="py-2.5">
                    <p className="text-sm font-medium text-ink">{item.label}</p>
                    <p className="text-xs text-ink-soft">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function patientTabs(patient) {
  if (!patient) return [];
  return [
    { label: "Medical History", value: "Hypertension · Type 2 Diabetes" },
    { label: "Consultations", value: "3 previous consultations" },
    { label: "Prescriptions", value: "2 active prescriptions" },
    { label: "Laboratory Reports", value: "1 completed report" },
    { label: "Follow-Ups", value: "1 upcoming follow-up" },
  ];
}

function Info({ label, value, highlight }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${highlight ? "text-coral-dark" : "text-ink"}`}>{value || "—"}</p>
    </div>
  );
}
