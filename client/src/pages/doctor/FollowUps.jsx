import { useEffect, useState } from "react";
import { Calendar, Search } from "lucide-react";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";

export default function DoctorFollowUps() {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    doctorApi
      .getFollowUps()
      .then((d) => setFollowUps(d.followUps))
      .catch(() => setFollowUps(fallbackDoctorData.followUps))
      .finally(() => setLoading(false));
  }, []);

  const filtered = followUps.filter((f) => {
    const matchesSearch = (f.patient?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || f.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-teal-deep">Follow-Ups</h1>
        <p className="mt-1 text-sm text-ink-soft font-medium">Upcoming follow-up patients.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient..." className="pl-9" />
        </div>
        <div className="flex gap-2">
          {["All", "Upcoming", "Completed", "Cancelled"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${filter === s ? "bg-teal-mid text-white" : "bg-cream text-ink-soft hover:bg-teal-pale"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl border border-deept/10 bg-white" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-deept/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft"><Calendar className="inline size-3.5 mr-1" />Patient</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Previous Diagnosis</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Follow-Up Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-soft">No follow-up patients found.</td></tr>}
              {filtered.map((f, i) => (
                <tr key={f.id || i} className="transition-colors hover:bg-softcream">
                  <td className="px-4 py-3 font-semibold text-ink">{f.patient?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{(f.consultation && f.consultation.diagnosis) || "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{f.date}{f.time && ` · ${f.time}`}</td>
                  <td className="px-4 py-3 text-ink-soft">{f.reason || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
