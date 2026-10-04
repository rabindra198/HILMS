import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorTrustNote,
  StatusBadge,
  CHIP_BUTTON,
  formatDate,
  formatSlot,
  formatSlotEnd,
  humanise,
} from "./doctorUi";

/**
 * Working hours (read-only).
 *
 * The SRS asks for doctor availability to be configurable, and the Doctor module
 * does not have an availability model or route to store it in. Rather than
 * shipping an editor whose Save button goes nowhere - or worse, an
 * availability field on the appointment model that the slot-collision check
 * never reads - this screen shows what is actually true: the window in which
 * you currently hold appointments, plus who to ask for a change.
 *
 * Closing this out needs one backend decision, not a UI one: an availability
 * collection the booking service validates against.
 */

export default function DoctorWorkingHours() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
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

  const booked = appointments.filter((item) => !["CANCELLED", "NO_SHOW"].includes(String(item.status || "").toUpperCase()));

  // The observed window: the earliest and latest slots this doctor actually holds.
  // Rounding to whole minutes keeps the headline readable.
  const times = booked.map((item) => Number(item.startMinutes)).filter((value) => Number.isFinite(value));
  const earliest = times.length ? Math.min(...times) : null;
  const latest = times.length ? Math.max(...times.map((value, index) => value + Number(booked[index]?.durationMinutes || 0))) : null;

  const days = booked.reduce((totals, item) => {
    const key = new Date(item.appointmentDate).toLocaleDateString(undefined, { weekday: "long" });
    totals[key] = (totals[key] || 0) + 1;
    return totals;
  }, {});

  const busiest = Object.entries(days).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <DoctorPageShell
      title="Working Hours"
      description="The clinic window you currently hold appointments in."
      actions={
        <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="flex items-start gap-3 rounded-2xl border-2 border-coral/30 bg-coral-pale px-4 py-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-coral-dark" />
        <div>
          <p className="text-sm font-extrabold text-coral-dark">Not editable from this account</p>
          <p className="mt-1 text-sm text-coral-dark">
            Working hours are a clinic-wide roster. Editing them here would let one doctor open slots the Front Desk has
            not staffed, and the booking service checks that roster — so a change saved on this screen would be ignored
            at the moment it mattered. Ask Super Admin to amend your roster.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border-2 border-deept/10 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Live appointments</p>
          <p className="mt-1.5 font-heading text-2xl font-extrabold text-teal-deep">{loading ? "—" : booked.length}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Booked and not cancelled</p>
        </div>
        <div className="rounded-2xl border-2 border-deept/10 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Earliest slot held</p>
          <p className="mt-1.5 font-heading text-2xl font-extrabold text-teal-deep">
            {earliest == null ? "—" : formatSlot(earliest)}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">Across your booked list</p>
        </div>
        <div className="rounded-2xl border-2 border-deept/10 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Latest finish</p>
          <p className="mt-1.5 font-heading text-2xl font-extrabold text-teal-deep">{latest == null ? "—" : formatSlot(latest)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">End of your last held slot</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <DoctorCard title="Your bookable window" description="Derived from your current appointment list, not a stored roster.">
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-deept/5" />
          ) : error ? (
            <p className="rounded-xl border border-coral/30 bg-coral-pale px-4 py-3 text-sm text-coral-dark">{error}</p>
          ) : !booked.length ? (
            <p className="rounded-xl border border-dashed border-deept/20 px-4 py-10 text-center text-sm text-ink-soft">
              You have no booked appointments yet, so there is no window to report. Once the Front Desk books you in, your
              clinic hours appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(days)
                .sort()
                .map(([day, count]) => (
                  <li key={day} className="flex items-center justify-between gap-3 rounded-xl border border-deept/10 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <Clock className="size-4 text-teal-mid" />
                      {day}
                    </span>
                    <span className="text-xs font-bold text-ink-soft">
                      {count} appointment{count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </DoctorCard>

        <div className="space-y-6">
          <DoctorCard title="Busiest days">
            {busiest.length ? (
              <ul className="space-y-2">
                {busiest.map(([day, count]) => (
                  <li key={day} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{day}</span>
                    <StatusBadge status={`${count} booked`} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">No bookings to rank yet.</p>
            )}
          </DoctorCard>

          <DoctorCard title="Upcoming slots">
            {booked
              .filter((item) => new Date(item.appointmentDate) >= new Date(new Date().toDateString()))
              .sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate))
              .slice(0, 6)
              .map((item) => (
                <p key={item._id} className="flex items-center justify-between gap-3 border-b border-deept/8 py-2 text-sm last:border-0">
                  <span className="font-mono text-teal-deep">
                    {formatDate(item.appointmentDate)} · {formatSlot(item.startMinutes)}–{formatSlotEnd(item)}
                  </span>
                  <span className="truncate text-ink-soft">{item.patient?.name || humanise(item.type)}</span>
                </p>
              ))}
            {!booked.length && <p className="text-sm text-ink-soft">Nothing upcoming.</p>}
          </DoctorCard>

          <Link to="/doctor/schedule" className={CHIP_BUTTON}>
            Open the week view
          </Link>
        </div>
      </div>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
