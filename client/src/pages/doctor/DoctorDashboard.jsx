import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, Clock, CheckCircle2, Stethoscope, ClipboardCheck, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";

const fallback = () => Promise.resolve(fallbackDoctorData.dashboard);

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
};

export default function DoctorDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    doctorApi
      .getDashboard()
      .then(setData)
      .catch(() => fallback().then(setData))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const stats = data?.stats || fallbackDoctorData.dashboard.stats;
  const appointments = data?.appointments || [];

  const statCards = [
    { title: "Today's Appointments", value: stats.todayAppointments, description: "Scheduled for today", icon: Calendar, variant: "teal" },
    { title: "Pending Lab Reports", value: stats.pendingLabReports, description: "Awaiting results", icon: ClipboardCheck, variant: "sand" },
    { title: "Follow-Up Patients", value: stats.followUpPatients, description: "Upcoming visits", icon: Stethoscope, variant: "lavender" },
    { title: "Completed Today", value: stats.completedToday, description: "Consultations done", icon: CheckCircle2, variant: "coral" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-teal-deep leading-tight sm:text-3xl">
          {greeting()}, Dr. {user?.name?.replace(/^Dr\.?\s*/i, "") || "Sharma"}
        </h1>
        <p className="mt-1 text-base text-ink-soft font-medium">
          Here is your clinical overview for today.
        </p>
        <p className="mt-0.5 text-sm text-ink-soft/70">{today}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-deept/10 bg-white" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <StatCard key={s.title} title={s.title} value={s.value} description={s.description} icon={s.icon} variant={s.variant} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-teal-deep">Today's Appointments</h2>
          <Link to="/doctor/appointments" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-mid hover:underline">
            View all <ChevronRight className="size-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream">
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Time</th>
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Age</th>
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Gender</th>
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Type</th>
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-3 pb-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {appointments.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-ink-soft">
                    No appointments scheduled for today.
                  </td>
                </tr>
              )}
              {appointments.map((apt) => {
                const patient = apt.patient || {};
                return (
                  <tr key={apt.id} className="transition-colors hover:bg-softcream">
                    <td className="px-3 py-3.5 font-medium text-ink">{apt.time}</td>
                    <td className="px-3 py-3.5 font-semibold text-ink">{patient.name}</td>
                    <td className="px-3 py-3.5 text-ink-soft">{patient.age}</td>
                    <td className="px-3 py-3.5 text-ink-soft">{patient.gender}</td>
                    <td className="px-3 py-3.5 text-ink-soft">{apt.type}</td>
                    <td className="px-3 py-3.5"><StatusBadge status={apt.status} /></td>
                    <td className="px-3 py-3.5">
                      {apt.status === "Waiting" || apt.status === "In Consultation" ? (
                        <button
                          onClick={() => navigate(`/doctor/consultation/${apt.id}`)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-coral-dark transition-all"
                        >
                          <Clock className="size-3.5" /> Start Consultation
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/doctor/consultation/${apt.id}`)}
                          className="text-sm font-semibold text-teal-mid hover:underline"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
