import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  FileText,
  FlaskConical,
  Pill,
  RefreshCw,
  Stethoscope,
} from "lucide-react";
import { patientApi, getApiError } from "@/services/patientApi";
import { useAuth } from "@/context/AuthContext";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  PatientCard,
  PatientPageShell,
  PatientTrustNote,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  formatDate,
  formatDateTime,
  formatSlotRange,
  relativeTime,
} from "./patientUi";

/**
 * Patient dashboard (FR-PT-02).
 *
 * Reads `/patient/dashboard`, which assembles the summary server-side from the same
 * appointment, prescription and laboratory collections the rest of the system
 * writes. Nothing here is seeded or cached in the browser: if a doctor issues a
 * prescription, it appears after a refresh because it is the same record.
 */
export default function PatientDashboardContent() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      setSummary(await patientApi.getDashboard());
      setError("");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upcoming = summary?.upcomingAppointment;
  const recent = summary?.recentAppointments || [];

  return (
    <PatientPageShell
      title={`Welcome back, ${user?.name?.split(" ")[0] || "there"}`}
      description="Your appointments, prescriptions and laboratory results in one place."
      actions={
        <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {error && (
        <div className="rounded-2xl border border-coral/40 bg-coral-pale px-4 py-3 text-sm font-semibold text-coral-dark">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Upcoming appointments"
          value={loading ? "-" : summary?.upcomingAppointmentCount ?? 0}
          description={upcoming ? `Next on ${formatDate(upcoming.appointmentDate)}` : "Nothing booked yet"}
          icon={CalendarDays}
        />
        <StatCard
          title="Pending lab tests"
          value={loading ? "-" : summary?.pendingLabRequestCount ?? 0}
          description="Requested, not yet verified"
          icon={FlaskConical}
          variant="lavender"
        />
        <StatCard
          title="Verified reports"
          value={loading ? "-" : summary?.verifiedReportCount ?? 0}
          description="Signed off by the laboratory"
          icon={FileText}
          variant="sand"
        />
        <StatCard
          title="Active prescriptions"
          value={loading ? "-" : summary?.activePrescriptionCount ?? 0}
          description={summary?.unreadNotificationCount ? `${summary.unreadNotificationCount} unread update(s)` : "No new updates"}
          icon={Pill}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <PatientCard
            title="Next appointment"
            description="The visit your doctor is expecting you at."
            action={
              <Link to="/patient/appointments" className={PRIMARY_BUTTON}>
                Book or manage
              </Link>
            }
          >
            {loading ? (
              <p className="text-sm text-ink-soft">Loading your appointments...</p>
            ) : upcoming ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-bold text-teal-deep">
                    {upcoming.doctor?.name || "Your doctor"}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {formatDateTime(upcoming.appointmentDate)} &middot; {formatSlotRange(upcoming)}
                    {upcoming.doctor?.department ? ` · ${upcoming.doctor.department}` : ""}
                  </p>
                  {upcoming.reason && <p className="mt-2 text-sm text-ink-soft">Reason: {upcoming.reason}</p>}
                </div>
                <StatusBadge status={upcoming.status} />
              </div>
            ) : (
              <div className="text-sm text-ink-soft">
                <p>You have no upcoming appointment.</p>
                <Link to="/patient/appointments" className="mt-3 inline-block font-bold text-teal-mid">
                  Book a consultation
                </Link>
              </div>
            )}
          </PatientCard>

          <PatientCard
            title="Recent appointments"
            description="Your last few visits, newest first."
            action={
              <Link to="/patient/appointments" className="text-xs font-bold text-teal-mid">
                View all
              </Link>
            }
          >
            {loading ? (
              <p className="text-sm text-ink-soft">Loading...</p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-ink-soft">No appointments yet.</p>
            ) : (
              <ul className="divide-y divide-deept/5">
                {recent.slice(0, 5).map((appointment) => (
                  <li key={appointment._id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-teal-deep">
                        {appointment.doctor?.name || "Doctor"}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {formatDate(appointment.appointmentDate)} &middot; {formatSlotRange(appointment)}
                        {appointment.reason ? ` · ${appointment.reason}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            )}
          </PatientCard>
        </div>

        <div className="space-y-6">
          <PatientCard title="Quick actions">
            <div className="grid grid-cols-1 gap-2">
              <Link to="/patient/appointments" className={SECONDARY_BUTTON}>
                <CalendarDays className="size-4" />
                Book an appointment
              </Link>
              <Link to="/patient/laboratory-reports" className={SECONDARY_BUTTON}>
                <FlaskConical className="size-4" />
                Laboratory reports
              </Link>
              <Link to="/patient/prescriptions" className={SECONDARY_BUTTON}>
                <Pill className="size-4" />
                My prescriptions
              </Link>
              <Link to="/patient/medical-history" className={SECONDARY_BUTTON}>
                <Stethoscope className="size-4" />
                Medical history
              </Link>
              <Link to="/patient/notifications" className={SECONDARY_BUTTON}>
                <Bell className="size-4" />
                Notifications
                {summary?.unreadNotificationCount > 0 && (
                  <span className="rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold text-white">
                    {summary.unreadNotificationCount}
                  </span>
                )}
              </Link>
            </div>
          </PatientCard>

          <PatientCard title="Latest laboratory report">
            {loading ? (
              <p className="text-sm text-ink-soft">Loading...</p>
            ) : summary?.latestReport ? (
              <div className="space-y-2">
                <p className="font-heading text-base font-bold text-teal-deep">
                  {summary.latestReport.test?.name || "Laboratory report"}
                </p>
                <p className="text-xs text-ink-soft">Verified {formatDateTime(summary.latestReport.verifiedAt)}</p>
                <Link to="/patient/laboratory-reports" className="inline-block text-xs font-bold text-teal-mid">
                  View results
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">No verified reports yet.</p>
            )}
          </PatientCard>

          <PatientCard title="Latest prescription">
            {loading ? (
              <p className="text-sm text-ink-soft">Loading...</p>
            ) : summary?.latestPrescription ? (
              <div className="space-y-2">
                <p className="font-heading text-base font-bold text-teal-deep">
                  {summary.latestPrescription.prescriptionNo}
                </p>
                <p className="text-xs text-ink-soft">
                  {summary.latestPrescription.doctor?.name || "Your doctor"} &middot;{" "}
                  {relativeTime(summary.latestPrescription.issuedAt)}
                </p>
                <Link to="/patient/prescriptions" className="inline-block text-xs font-bold text-teal-mid">
                  View medicines
                </Link>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">No prescriptions yet.</p>
            )}
          </PatientCard>

          <PatientTrustNote />
        </div>
      </div>
    </PatientPageShell>
  );
}