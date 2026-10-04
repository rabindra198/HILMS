import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  FlaskConical,
  RefreshCw,
  CalendarClock,
  Users,
  CheckCircle2,
  Bell,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorResponsiveList,
  DoctorTrustNote,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatSlot,
  formatSlotEnd,
  humanise,
  ageFromDateOfBirth,
  CHIP_BUTTON,
  PRIMARY_BUTTON,
} from "./doctorUi";

/**
 * Doctor dashboard (FR-DR-01).
 *
 * One request for the whole screen. The backend builds it as a single aggregate
 * because the panels are read together - five parallel calls here would be five
 * round trips for one paint, and they could disagree with each other mid-refresh
 * (a count from one render next to a list from another).
 *
 * No app header bar: the sidebar already carries Profile, Notifications and
 * Logout, so a second bar above the content only repeated the same controls. The
 * dedicated Notifications page stays reachable from the sidebar.
 */

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

/** `Dr. Meera Sharma` -> `Dr. Sharma`. Falls back to the full name. */
const shortName = (name) => {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length < 2) return name || "Doctor";
  return `Dr. ${parts[parts.length - 1]}`;
};

function StatTile({ title, value, description, icon: Icon, to, tone = "teal" }) {
  const tones = {
    teal: "bg-teal-mid/15 text-teal-mid",
    lavender: "bg-lavender/30 text-lavender",
    sand: "bg-teal-mid/20 text-teal-mid",
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-soft">{title}</p>
          <p className="font-heading text-3xl font-extrabold text-teal-deep">{value}</p>
          {description && <p className="text-xs font-medium text-ink-soft">{description}</p>}
        </div>
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-6" />
        </div>
      </div>
    </>
  );

  // The tile is the primary route to the panel it counts, so the whole card is
  // the hit target rather than a small "view" link that is hard to hit on a phone.
  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-2xl border-2 border-deept/10 bg-white p-5 no-underline transition-shadow hover:shadow-md"
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-2xl border-2 border-deept/10 bg-white p-5">{body}</div>;
}

export default function DoctorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    // A silent refresh keeps the current data on screen. Blanking the whole
    // dashboard to a skeleton every time a status changes makes it feel like the
    // app is reloading rather than updating.
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      setData(await doctorApi.getDashboard());
    } catch (loadError) {
      const message = getDoctorApiError(loadError);
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Status changes go through the API and then re-read the aggregate, so the
   * stat tiles can never drift from the lists beside them - counting locally is
   * exactly how "Completed today: 3" ends up next to a list showing two.
   */
  const setStatus = async (appointment, status) => {
    setBusyId(appointment._id);
    try {
      await doctorApi.updateAppointmentStatus(appointment._id, status);
      toast.success(`Appointment marked ${humanise(status).toLowerCase()}`);
      await load({ silent: true });
    } catch (actionError) {
      toast.error(getDoctorApiError(actionError));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <DoctorPageShell title="Dashboard" description="Loading your clinic day...">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-2xl border-2 border-deept/10 bg-white" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl border border-deept/10 bg-white" />
        </div>
      </DoctorPageShell>
    );
  }

  // A failed load must not leave a blank white screen.
  if (error && !data) {
    return (
      <DoctorPageShell title="Dashboard">
        <DoctorCard>
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="font-heading text-lg font-bold text-coral-dark">Unable to load your dashboard</p>
            <p className="max-w-sm text-sm text-ink-soft">{error}</p>
            <button type="button" onClick={() => load()} className={PRIMARY_BUTTON}>
              <RefreshCw className="size-4" /> Try again
            </button>
          </div>
        </DoctorCard>
      </DoctorPageShell>
    );
  }

  const stats = data?.stats || {};
  const today = data?.todayAppointments || [];
  const pendingReports = data?.pendingLabReports || [];
  const inFlight = data?.inFlightLabRequests || [];
  const followUps = data?.followUpPatients || [];
  const recentConsultations = data?.recentConsultations || [];

  return (
    <DoctorPageShell
      title={`${greeting()}, ${shortName(data?.doctor?.name)}`}
      description={
        <>
          {formatDate(data?.date)} · {data?.doctor?.department || "General Medicine"}
          {data?.doctor?.specialization ? ` · ${data.doctor.specialization}` : ""}
        </>
      }
      actions={
        <button type="button" onClick={() => load({ silent: true })} disabled={refreshing} className={CHIP_BUTTON}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      }
    >
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral-pale px-4 py-3 text-sm font-medium text-coral-dark">
          {error} Showing the last data that loaded.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          title="Today's Appointments"
          value={stats.todayAppointments ?? 0}
          description={`${stats.completedToday ?? 0} completed so far`}
          icon={Calendar}
          to="/doctor/appointments?scope=today"
        />
        <StatTile
          title="Pending Lab Reports"
          value={stats.pendingLabReports ?? 0}
          description="Verified, waiting on your review"
          icon={FlaskConical}
          tone="lavender"
          to="/doctor/laboratory-reports?reviewed=false"
        />
        <StatTile
          title="Follow-up Patients"
          value={stats.followUpPatients ?? 0}
          description="Visits you still owe"
          icon={CalendarClock}
          tone="sand"
          to="/doctor/follow-ups"
        />
        <StatTile
          title="Completed Consultations"
          value={stats.completedToday ?? 0}
          description={`of ${stats.todayAppointments ?? 0} seen today`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile title="Assigned Patients" value={stats.assignedPatients ?? 0} description="On your care team" icon={Users} to="/doctor/patients" />
        <StatTile title="In-flight Lab Requests" value={stats.inFlightLabRequests ?? 0} description="With the laboratory now" icon={FlaskConical} tone="lavender" />
        <StatTile title="Unread Notifications" value={stats.unreadNotifications ?? 0} description="Needs your attention" icon={Bell} tone="sand" to="/doctor/notifications" />
        <StatTile title="Recent Consultations" value={recentConsultations.length} description="Your last encounters" icon={UserRound} to="/doctor/consultations" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DoctorCard
          title="Today's schedule"
          description={
            today.length
              ? `${today.length} ${today.length === 1 ? "appointment" : "appointments"} booked for today.`
              : "Nothing booked for today."
          }
          action={
            <Link to="/doctor/appointments?scope=today" className="text-sm font-bold text-teal-mid no-underline underline underline-offset-4">
              Manage
            </Link>
          }
        >
          <DoctorResponsiveList
            rows={today}
            loading={false}
            error=""
            empty={!today.length}
            emptyMessage="No appointments booked for today. Book one from the Appointments screen."
            columns={[
              {
                header: "Time",
                primary: true,
                render: (item) => (
                  <p className="font-mono text-sm font-bold text-teal-deep">
                    {formatSlot(item.startMinutes)} – {formatSlotEnd(item)}
                  </p>
                ),
              },
              { header: "Patient", render: (item) => <span className="font-semibold text-ink">{item.patient?.name || "Patient"}</span> },
              { header: "Type", hideOnMobile: true, render: (item) => <span className="text-ink-soft">{humanise(item.type)}</span> },
              { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
            ]}
            actions={(item) => {
              const status = String(item.status || "").toUpperCase();
              // Same transition map the service enforces. A button that always 409s
              // makes the screen look broken, so only legal moves are offered.
              const options = {
                SCHEDULED: ["CONFIRMED"],
                CONFIRMED: ["IN_CONSULTATION"],
                IN_CONSULTATION: ["COMPLETED"],
              }[status];

              if (!options?.length) return <span className="self-center text-xs text-ink-soft">No action</span>;

              return options.map((next) => (
                <button
                  key={next}
                  type="button"
                  disabled={busyId === item._id}
                  onClick={() => setStatus(item, next)}
                  className={CHIP_BUTTON}
                >
                  {busyId === item._id ? "Saving..." : humanise(next)}
                </button>
              ));
            }}
          />
        </DoctorCard>

        <DoctorCard
          title="Reports awaiting your review"
          description={
            pendingReports.length
              ? "Verified by the laboratory, not yet commented on by you."
              : "You are up to date."
          }
          action={
            <Link to="/doctor/laboratory-reports" className="text-sm font-bold text-teal-mid no-underline underline underline-offset-4">
              Open reports
            </Link>
          }
        >
          <DoctorResponsiveList
            rows={pendingReports}
            loading={false}
            error=""
            empty={!pendingReports.length}
            emptyMessage="No verified reports are waiting on you."
            columns={[
              {
                header: "Report",
                primary: true,
                render: (item) => (
                  <>
                    <p className="font-semibold text-ink">{item.test?.name || item.test?.testName || "Laboratory test"}</p>
                    <p className="font-mono text-xs text-teal-mid">{item.reportId || String(item._id).slice(-8).toUpperCase()}</p>
                  </>
                ),
              },
              { header: "Patient", render: (item) => <span className="font-medium text-ink">{item.patient?.name || "Patient"}</span> },
              { header: "Verified", hideOnMobile: true, render: (item) => <span className="text-ink-soft">{formatDate(item.verifiedAt)}</span> },
              { header: "Priority", render: (item) => <StatusBadge status={item.labRequest?.priority || "ROUTINE"} /> },
            ]}
            actions={(item) => (
              <Link to={`/doctor/laboratory-reports?report=${item._id}`} className={CHIP_BUTTON}>
                Review
              </Link>
            )}
          />
        </DoctorCard>

        <DoctorCard
          title="Upcoming follow-ups"
          description="Patients you asked to come back."
          action={
            <Link to="/doctor/follow-ups" className="text-sm font-bold text-teal-mid no-underline underline underline-offset-4">
              Manage
            </Link>
          }
        >
          <DoctorResponsiveList
            rows={followUps}
            loading={false}
            error=""
            empty={!followUps.length}
            emptyMessage="No follow-ups scheduled. Book one from a completed consultation."
            columns={[
              {
                header: "Patient",
                primary: true,
                render: (item) => <span className="font-semibold text-ink">{item.patient?.name || "Patient"}</span>,
              },
              { header: "When", render: (item) => <span className="text-ink-soft">{formatDateTime(item.appointmentDate)}</span> },
              {
                header: "Because",
                hideOnMobile: true,
                render: (item) => (
                  <span className="block max-w-[220px] truncate text-ink-soft" title={item.previousConsultation?.diagnosis || ""}>
                    {item.previousConsultation?.diagnosis || item.reason || "-"}
                  </span>
                ),
              },
              { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
            ]}
            actions={(item) => (
              <Link to={`/doctor/consultations?appointment=${item._id}`} className={CHIP_BUTTON}>
                Open visit
              </Link>
            )}
          />
        </DoctorCard>

        <DoctorCard
          title="Laboratory requests in flight"
          description="Ordered by you and not yet verified."
        >
          <DoctorResponsiveList
            rows={inFlight}
            loading={false}
            error=""
            empty={!inFlight.length}
            emptyMessage="No laboratory requests are currently with the laboratory."
            columns={[
              {
                header: "Test",
                primary: true,
                render: (item) => <span className="font-semibold text-ink">{item.test?.name || item.test?.testName || "Laboratory test"}</span>,
              },
              { header: "Patient", render: (item) => <span className="text-ink-soft">{item.patient?.name || "Patient"}</span> },
              { header: "Requested", hideOnMobile: true, render: (item) => <span className="text-ink-soft">{formatDate(item.requestedDate)}</span> },
              { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
            ]}
          />
        </DoctorCard>
      </div>

      <DoctorCard
        title="Recent consultations"
        description="Your last encounters, newest first."
        action={
          <Link to="/doctor/consultations" className="text-sm font-bold text-teal-mid no-underline underline underline-offset-4">
            All consultations
          </Link>
        }
      >
        <DoctorResponsiveList
          rows={recentConsultations}
          loading={false}
          error=""
          empty={!recentConsultations.length}
          emptyMessage="You have not recorded a consultation yet."
          columns={[
            {
              header: "Patient",
              primary: true,
              render: (item) => {
                const age = ageFromDateOfBirth(item.patient?.dateOfBirth);
                return (
                  <>
                    <p className="font-semibold text-ink">{item.patient?.name || "Patient"}</p>
                    {age != null && <p className="text-xs text-ink-soft">{age} yrs</p>}
                  </>
                );
              },
            },
            {
              header: "Diagnosis",
              render: (item) => (
                <span className="block max-w-[260px] truncate text-ink" title={item.diagnosis || ""}>
                  {item.diagnosis || "Not recorded yet"}
                </span>
              ),
            },
            { header: "Medicines", render: (item) => <span className="text-ink-soft">{item.prescriptionCount || 0}</span> },
            { header: "Lab orders", render: (item) => <span className="text-ink-soft">{item.labRequestCount || 0}</span> },
            { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
            { header: "When", hideOnMobile: true, render: (item) => <span className="text-ink-soft">{formatDateTime(item.createdAt)}</span> },
          ]}
          actions={(item) => (
            <Link to={`/doctor/consultations?consultation=${item._id}`} className={CHIP_BUTTON}>
              Open
            </Link>
          )}
        />
      </DoctorCard>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
