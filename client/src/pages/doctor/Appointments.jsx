import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, CheckCircle2, Users, Search } from "lucide-react";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";

export default function DoctorAppointments() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    doctorApi
      .getAppointments()
      .then((d) => setAppointments(d.appointments))
      .catch(() => setAppointments(fallbackDoctorData.appointments))
      .finally(() => setLoading(false));
  }, []);

  const statuses = ["All", "Waiting", "In Consultation", "Completed", "Cancelled", "Scheduled"];

  const filtered = appointments.filter((a) => {
    const matchesSearch = (a.patient?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || a.status === filter;
    return matchesSearch && matchesFilter;
  });

  const stats = [
    { title: "Today's Appointments", value: appointments.length, description: "Total scheduled", icon: Calendar, variant: "teal" },
    { title: "Waiting", value: appointments.filter((a) => a.status === "Waiting").length, description: "Awaiting consultation", icon: Clock, variant: "sand" },
    { title: "In Consultation", value: appointments.filter((a) => a.status === "In Consultation").length, description: "Currently being seen", icon: Users, variant: "lavender" },
    { title: "Completed", value: appointments.filter((a) => a.status === "Completed").length, description: "Consultations done", icon: CheckCircle2, variant: "coral" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-teal-deep">Appointments</h1>
        <p className="mt-1 text-sm text-ink-soft font-medium">Manage and view your patient appointments.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-deept/10 bg-white" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => <StatCard key={s.title} title={s.title} value={s.value} description={s.description} icon={s.icon} variant={s.variant} />)}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient name..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === s ? "bg-teal-mid text-white" : "bg-cream text-ink-soft hover:bg-teal-pale"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-deept/10 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-deept/10 bg-cream">
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Time</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Age</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Gender</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-deept/5">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-soft">
                  No appointments match your criteria.
                </td>
              </tr>
            )}
            {filtered.map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-softcream">
                <td className="px-4 py-3 font-medium text-ink">{a.time}</td>
                <td className="px-4 py-3 font-semibold text-ink">{a.patient?.name}</td>
                <td className="px-4 py-3 text-ink-soft">{a.patient?.age}</td>
                <td className="px-4 py-3 text-ink-soft">{a.patient?.gender}</td>
                <td className="px-4 py-3 text-ink-soft">{a.type}</td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/doctor/consultation/${a.id}`)} className="text-sm font-semibold text-teal-mid hover:underline">
                    {a.status === "Waiting" || a.status === "In Consultation" ? "Start Consultation" : "View"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
