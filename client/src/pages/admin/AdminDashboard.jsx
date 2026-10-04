import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Calendar,
  FlaskConical,
  CreditCard,
  RefreshCw,
  UserPlus,
  Plus,
  ChevronRight,
  Bell,
  Inbox,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { getDashboard } from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";
import { formatMoney, formatDelta, formatTime12, formatDateTime, todayInputValue } from "@/lib/format";

/**
 * Admin dashboard (FR-AD-01).
 *
 * Every figure here comes from one `GET /admin/dashboard` call rather than from
 * separate queries assembled in the browser. That is deliberate: the headline
 * counts and the lists underneath them are computed server-side from the same
 * filter, so the card can never claim "12 appointments today" above a table of
 * 14. Each card also carries a real comparison value (yesterday / last month), so
 * the trend is a measured delta rather than a decorative arrow.
 */

const CARD_THEME = {
  teal: { card: "bg-teal-pale", icon: "bg-teal-mid/15 text-teal-mid" },
  lavender: { card: "bg-lavender-pale", icon: "bg-lavender/30 text-lavender" },
  sand: { card: "bg-softteal", icon: "bg-teal-mid/15 text-teal-mid" },
  coral: { card: "bg-teal-pale", icon: "bg-teal-mid/20 text-teal-mid" },
};

/** One dashboard card. `trend` of null renders no arrow, because we have no base. */
function MetricCard({ title, value, description, icon: Icon, variant = "teal", trend, trendUp }) {
  const theme = CARD_THEME[variant] || CARD_THEME.teal;

  return (
    <div className={`rounded-2xl border border-deept/5 ${theme.card} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-soft">{title}</p>
          <p className="mt-1 font-heading text-2xl font-bold text-teal-deep">{value}</p>
        </div>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${theme.icon}`}>
          <Icon className="size-5" />
        </div>
      </div>
      {trend !== null && trend !== undefined ? (
        <p className={`mt-2 flex items-center gap-1 text-xs font-bold ${trendUp ? "text-teal-mid" : "text-coral-dark"}`}>
          {trendUp ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {trend}
        </p>
      ) : null}
      {description && <p className="mt-1 text-xs font-medium text-ink-soft">{description}</p>}
    </div>
  );
}

function Panel({ title, to, actionLabel, children }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-deept/10 px-5 py-4">
        <h2 className="font-heading text-lg font-bold text-teal-deep">{title}</h2>
        {to ? (
          <Link
            to={to}
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-mid transition hover:text-teal-deep"
          >
            {actionLabel || "View all"}
            <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function AdminDashboard() {
  const [date, setDate] = useState(todayInputValue());
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await getDashboard({ date }));
    } catch (err) {
      setError(getErrorMessage(err, "Could not load the dashboard."));
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const cards = data?.cards || {};
  const revenue = cards.revenue || {};
  const appointments = cards.appointmentsToday || {};
  const newPatients = cards.newPatientsToday || {};
  const lab = cards.pendingLabTests || {};

  const labByStatus = data?.laboratory?.byStatus || [];
  const labStatusLookup = labByStatus.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {});

  const viewingToday = date === todayInputValue();

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Dashboard</h1>
          <p className="text-base font-medium text-ink-soft">
            {viewingToday
              ? "Live activity across the hospital for today."
              : `Hospital activity for ${formatDate(date, "DD MMM YYYY")}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            max={todayInputValue()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Dashboard date"
            className="h-11 rounded-xl border border-deept/15 bg-white px-4 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
          />
          <button
            type="button"
            onClick={loadDashboard}
            disabled={isLoading}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-deept/15 bg-white px-4 text-sm font-semibold text-teal-deep transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <LoadingSkeleton rows={5} columns={5} />
      ) : error ? (
        <ErrorState title="Could not load the dashboard" description={error} onRetry={loadDashboard} />
      ) : (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Appointments"
              value={appointments.value ?? 0}
              icon={Calendar}
              variant="lavender"
              trend={formatDelta(appointments.changePercent)}
              trendUp={(appointments.changePercent ?? 0) >= 0}
              description={`${appointments.previous ?? 0} the previous day`}
            />
            <MetricCard
              title="New patients"
              value={newPatients.value ?? 0}
              icon={Users}
              variant="teal"
              trend={formatDelta(newPatients.changePercent)}
              trendUp={(newPatients.changePercent ?? 0) >= 0}
              description="Registered on this date"
            />
            <MetricCard
              title="Pending lab tests"
              value={lab.value ?? 0}
              icon={FlaskConical}
              variant="sand"
              description="Awaiting laboratory acceptance"
            />
            <MetricCard
              title="Revenue this month"
              value={`Rs. ${formatMoney(revenue.collectedThisMonth)}`}
              icon={CreditCard}
              variant="coral"
              trend={formatDelta(revenue.changePercent)}
              trendUp={(revenue.changePercent ?? 0) >= 0}
              description={`Rs. ${formatMoney(revenue.collectedToday)} collected today`}
            />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              {/* Today's schedule */}
              <Panel title="Appointment schedule" to="/admin/appointments">
                {data.todayAppointments.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-ink-soft">
                    No appointments are booked for this date.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b-2 border-deept/10 bg-softteal/50">
                          <th scope="col" className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                            Time
                          </th>
                          <th scope="col" className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                            Patient
                          </th>
                          <th scope="col" className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                            Doctor
                          </th>
                          <th scope="col" className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-deept/5">
                        {data.todayAppointments.map((appointment) => (
                          <tr key={appointment._id} className="transition-colors hover:bg-teal-pale/30">
                            <td className="whitespace-nowrap px-5 py-3 font-semibold text-teal-deep">
                              {formatTime12(appointment.startTime)}
                            </td>
                            <td className="px-5 py-3 font-semibold text-ink">{appointment.patientName}</td>
                            <td className="px-5 py-3 text-ink-soft">{appointment.doctorName}</td>
                            <td className="px-5 py-3">
                              <StatusBadge status={appointment.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Patients registered on the selected date */}
              <Panel title="Recently registered" to="/admin/patients">
                {data.newPatients.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-ink-soft">No patients registered on this date.</p>
                ) : (
                  <ul className="divide-y divide-deept/5">
                    {data.newPatients.map((patient) => (
                      <li key={patient.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-pale text-teal-mid">
                          <Users className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{patient.name}</p>
                          <p className="truncate text-xs text-ink-soft">
                            {patient.phone || patient.email}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-ink-soft">
                          {formatDateTime(patient.registeredAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            {/* Right rail */}
            <div className="flex flex-col gap-6">
              {/* Laboratory pipeline */}
              <Panel title="Laboratory overview" to="/admin/laboratory">
                <div className="grid grid-cols-2 gap-3 p-5">
                  {[
                    { label: "Pending", value: labStatusLookup.PENDING ?? data.laboratory.pending ?? 0 },
                    { label: "Accepted", value: labStatusLookup.ACCEPTED ?? 0 },
                    { label: "Processing", value: labStatusLookup.PROCESSING ?? 0 },
                    { label: "Completed", value: labStatusLookup.COMPLETED ?? 0 },
                    { label: "Verified", value: labStatusLookup.VERIFIED ?? 0 },
                    { label: "Cancelled", value: labStatusLookup.CANCELLED ?? 0 },
                  ].map((tile) => (
                    <div key={tile.label} className="rounded-xl border border-deept/10 p-3">
                      <p className="text-xs font-medium text-ink-soft">{tile.label}</p>
                      <p className="mt-0.5 font-heading text-xl font-bold text-teal-deep">{tile.value}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Money position */}
              <section className="rounded-2xl border border-deept/10 bg-white p-5 shadow-sm">
                <h2 className="font-heading text-lg font-bold text-teal-deep">Billing position</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Collected today</dt>
                    <dd className="font-semibold text-ink">Rs. {formatMoney(revenue.collectedToday)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Payments today</dt>
                    <dd className="font-semibold text-ink">{revenue.paymentsToday ?? 0}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Outstanding</dt>
                    <dd className="font-semibold text-coral-dark">Rs. {formatMoney(revenue.outstanding)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Invoices unpaid</dt>
                    <dd className="font-semibold text-ink">{revenue.outstandingCount ?? 0}</dd>
                  </div>
                </dl>
                <Link
                  to="/admin/billing"
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-teal-mid px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-deep"
                >
                  Open billing
                  <ChevronRight className="size-4" />
                </Link>
              </section>

              {/* Inbox: access requests + notifications */}
              <section className="rounded-2xl border border-deept/10 bg-white p-5 shadow-sm">
                <h2 className="font-heading text-lg font-bold text-teal-deep">Needs attention</h2>
                <div className="mt-4 space-y-2">
                  <Link
                    to="/admin/access-requests"
                    className="flex items-center gap-3 rounded-xl border border-deept/10 px-3 py-2.5 transition hover:border-teal-mid/40 hover:bg-softteal"
                  >
                    <Inbox className="size-4 shrink-0 text-coral-dark" />
                    <span className="flex-1 text-sm font-medium text-ink">Access requests</span>
                    <span className="rounded-full bg-coral-pale px-2.5 py-0.5 text-xs font-bold text-coral-dark">
                      {data.accessRequests.pending ?? 0}
                    </span>
                  </Link>
                  <Link
                    to="/admin/notifications"
                    className="flex items-center gap-3 rounded-xl border border-deept/10 px-3 py-2.5 transition hover:border-teal/40 hover:bg-teal-pale/30"
                  >
                    <Bell className="size-4 shrink-0 text-teal-mid" />
                    <span className="flex-1 text-sm font-medium text-ink">Unread notifications</span>
                    <span className="rounded-full bg-teal-pale px-2.5 py-0.5 text-xs font-bold text-teal-mid">
                      {data.notifications.unread ?? 0}
                    </span>
                  </Link>
                </div>

                {data.notifications.recent.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-deept/5 pt-4">
                    {data.notifications.recent.map((notification) => (
                      <li key={notification._id} className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-deept/15" : "bg-coral"}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{notification.title}</p>
                          <p className="text-xs text-ink-soft">{formatDateTime(notification.createdAt)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Quick actions */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <Link
                  to="/admin/patients?new=1"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-teal-mid px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-mid/30 transition hover:-translate-y-0.5 hover:bg-teal-deep"
                >
                  <UserPlus className="size-4" />
                  Register patient
                </Link>
                <Link
                  to="/admin/appointments?new=1"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-teal/30 bg-white px-5 py-2.5 text-sm font-semibold text-teal-deep transition hover:border-teal-pale hover:bg-teal-pale/30"
                >
                  <Plus className="size-4" />
                  New appointment
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}