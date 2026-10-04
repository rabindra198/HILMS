import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Stethoscope } from "lucide-react";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorResponsiveList,
  DoctorTrustNote,
  StatusBadge,
  CHIP_BUTTON,
  formatDate,
  formatSlot,
  formatSlotEnd,
  toDateInput,
} from "./doctorUi";

/**
 * Clinic schedule (FR-DR-01, read-only view).
 *
 * Deliberately derived from real booked appointments rather than an editable
 * timetable: the backend has no doctor-availability model, and inventing an
 * editor here would produce a screen that saves nowhere and disagrees with the
 * slot checks in `appointment.service`. This view shows the day you actually have.
 */

const startOfWeek = (date) => {
  const copy = new Date(date);
  // Monday-first, matching the rest of the hospital's scheduling.
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const sameDay = (a, b) => toDateInput(a) === toDateInput(b);

export default function DoctorSchedule() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Date());

  const range = useMemo(() => {
    const from = startOfWeek(weekStart);
    return { from: toDateInput(from), to: toDateInput(addDays(from, 6)) };
  }, [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // `date` on the endpoint is a single calendar day, so filtering a week by it
      // would only ever populate one column. The whole bookable list is fetched
      // once and narrowed to the week here instead - one request, and the strip
      // cannot end up half-filled.
      const result = await doctorApi.getAppointments({ scope: "all", limit: 100 });
      setAppointments(result.items || []);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const forDay = (day) =>
    appointments
      .filter((item) => sameDay(item.appointmentDate, day))
      .sort((a, b) => Number(a.startMinutes) - Number(b.startMinutes));

  const dayAppointments = forDay(selected);
  const weekTotal = days.reduce((total, day) => total + forDay(day).length, 0);

  return (
    <DoctorPageShell
      title="Schedule"
      description={`Week of ${formatDate(range.from)} · ${weekTotal} booked appointment(s).`}
      actions={
        <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <DoctorCard
        title="Week"
        description="Your booked appointments, day by day."
        action={
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setWeekStart((current) => addDays(current, -7))}
              className="rounded-lg border border-deept/15 p-1.5 text-teal-deep hover:bg-teal-pale"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setWeekStart(startOfWeek(today));
                setSelected(today);
              }}
              className="rounded-lg border border-deept/15 px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
            >
              This week
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setWeekStart((current) => addDays(current, 7))}
              className="rounded-lg border border-deept/15 p-1.5 text-teal-deep hover:bg-teal-pale"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      >
        {/* Horizontal scroll keeps seven columns readable on a phone instead of
            squashing them into an unreadable grid. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {days.map((day) => {
            const count = forDay(day).length;
            const isSelected = sameDay(day, selected);
            const isToday = sameDay(day, new Date());
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelected(day)}
                className={`min-w-[84px] flex-1 rounded-2xl border px-3 py-3 text-center transition ${
                  isSelected ? "border-teal-mid bg-teal-pale" : "border-deept/10 bg-white hover:bg-teal-pale/40"
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  {day.toLocaleDateString(undefined, { weekday: "short" })}
                </p>
                <p className="font-heading text-xl font-extrabold text-teal-deep">{day.getDate()}</p>
                <p className="mt-1 text-xs font-bold text-ink-soft">
                  {count ? `${count} booked` : "Free"}
                  {isToday && <span className="block text-[10px] font-extrabold uppercase text-teal-mid">Today</span>}
                </p>
              </button>
            );
          })}
        </div>
      </DoctorCard>

      <DoctorCard title={formatDate(selected)} description={`${dayAppointments.length} appointment(s) on this day.`}>
        <DoctorResponsiveList
          rows={dayAppointments}
          loading={loading}
          error={error}
          empty={!dayAppointments.length}
          emptyMessage="Nothing booked on this day."
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
            { header: "Type", hideOnMobile: true, render: (item) => <span className="text-ink-soft">{item.type?.replace(/_/g, " ")}</span> },
            {
              header: "Reason",
              hideOnMobile: true,
              render: (item) => (
                <span className="block max-w-[220px] truncate text-ink-soft" title={item.reason || ""}>
                  {item.reason || "-"}
                </span>
              ),
            },
            { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
          ]}
          actions={(item) =>
            ["SCHEDULED", "CONFIRMED", "IN_CONSULTATION"].includes(String(item.status || "").toUpperCase()) ? (
              <Link to={`/doctor/consultations?appointment=${item._id}&patient=${item.patient?._id}`} className={CHIP_BUTTON}>
                <Stethoscope className="size-3.5" /> Open
              </Link>
            ) : null
          }
        />
      </DoctorCard>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-deept/12 px-4 py-3">
        <p className="flex items-start gap-2 text-xs text-ink-soft">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-teal-mid" />
          Bookable hours are set by Super Admin and enforced when an appointment is saved.
        </p>
        <Link to="/doctor/working-hours" className={CHIP_BUTTON}>
          Working hours
        </Link>
      </div>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
