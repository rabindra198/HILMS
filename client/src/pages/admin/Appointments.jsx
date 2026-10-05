import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Search,
  Plus,
  RefreshCw,
  CalendarDays,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  Eye,
  CalendarClock,
  Ban,
  Clock,
  UserRound,
} from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Modal } from "@/components/common/Modal";
import {
  getAppointments,
  getAppointment,
  getAppointmentQueue,
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  updateAppointmentStatus,
  getDoctors,
  getPatients,
  getDoctorSlots,
} from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";
import { formatTime12, formatDateTime, todayInputValue } from "@/lib/format";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

/**
 * Hospital-wide appointment administration (FR-AD-02 / FR-AD-03).
 *
 * Two views over the same real records: a filterable list, and the day's waiting
 * room grouped by doctor. The estimated wait shown in the queue is computed
 * server-side by walking each doctor's day in slot order (an over-running
 * consultation pushes the next patient back), so it is not a column the browser
 * guessed at.
 *
 * Booking goes through the same server-side rules a patient goes through -
 * numbering, double-booking and published clinic hours - so the slot picker reads
 * `GET /admin/doctors/:id/slots` and only ever offers slots the backend will
 * accept.
 */

const APPOINTMENT_TYPES = ["CONSULTATION", "FOLLOW_UP", "REPORT_REVIEW", "PROCEDURE"];

// Summary tiles rotate through the same four-tone palette as the Laboratory and
// dashboard stat tiles, so a KPI row reads identically wherever it appears.
const SUMMARY_TILE_BG = ["bg-teal-pale", "bg-softteal", "bg-lavender-pale", "bg-teal-pale"];

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_CONSULTATION", label: "In consultation" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No show" },
];

const SCOPE_FILTERS = [
  { value: "", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

/**
 * Statuses an administrator may set directly. Mirrors `ADMIN_TRANSITIONS` in
 * `adminAppointment.service` - the server enforces the same table and returns 409
 * for anything not allowed, so this only decides which buttons to draw.
 */
const STATUS_TRANSITIONS = {
  SCHEDULED: ["CONFIRMED", "IN_CONSULTATION", "NO_SHOW"],
  CONFIRMED: ["IN_CONSULTATION", "COMPLETED", "NO_SHOW"],
  IN_CONSULTATION: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const LOCKED_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];
const canReschedule = (status) => !LOCKED_STATUSES.includes(status);
const canCancel = (status) => !LOCKED_STATUSES.includes(status);

const humanise = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());

/** One row's inline status controls. */
function StatusActions({ appointment, onStatus, busy }) {
  const next = STATUS_TRANSITIONS[appointment.status] || [];
  if (!next.length) {
    return <span className="text-xs text-ink-soft">No further action</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {next.map((target) => (
        <button
          key={target}
          type="button"
          disabled={busy}
          onClick={() => onStatus(appointment, target)}
          className="rounded-full border border-teal/30 px-2.5 py-1 text-xs font-semibold text-teal-mid transition hover:bg-teal-pale disabled:opacity-50"
        >
          {humanise(target)}
        </button>
      ))}
    </div>
  );
}

/**
 * Booking / reschedule form.
 *
 * The patient and doctor pickers are real searches rather than `<select>` dumps:
 * a hospital has thousands of patients, so the list the Admin chooses from is the
 * server's paginated, filtered result.
 */
function AppointmentFormModal({ open, onClose, onSaved, doctors, appointment }) {
  const isReschedule = Boolean(appointment);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [type, setType] = useState("CONSULTATION");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [patientQuery, setPatientQuery] = useState("");
  const [patientOptions, setPatientOptions] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [slotState, setSlotState] = useState({ loading: false, slots: [], meta: null, error: null });

  // Rescheduling pre-fills from the existing booking and only needs the fields
  // that are actually changing, so the doctor stays optional.
  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setPatientId(String(appointment.patient?._id || appointment.patient || ""));
      setDoctorId(String(appointment.doctor?._id || appointment.doctor || ""));
      setDate(formatDate(appointment.appointmentDate));
      setStartTime(appointment.startTime || "");
      setDuration(String(appointment.durationMinutes || 30));
      setType(appointment.type || "CONSULTATION");
      setReason(appointment.reason || "");
      setPatientQuery("");
    } else {
      setPatientId("");
      setDoctorId("");
      setDate(todayInputValue());
      setStartTime("");
      setDuration("30");
      setType("CONSULTATION");
      setReason("");
      setPatientQuery("");
    }
  }, [open, appointment]);

  // Patient search. Cleared selections are reset so a stale id can never be
  // submitted against a name that no longer matches the query.
  useEffect(() => {
    if (!open || isReschedule) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      setPatientsLoading(true);
      try {
        const result = await getPatients({ search: patientQuery.trim() || undefined, limit: 20 });
        if (cancelled) return;
        setPatientOptions(result?.items || []);
      } catch {
        if (!cancelled) setPatientOptions([]);
      } finally {
        if (!cancelled) setPatientsLoading(false);
      }
    }, patientQuery ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, open, isReschedule]);

  /**
   * Slot availability is fetched from the server rather than generated here: it
   * already accounts for the doctor's published hours, every existing booking and
   * slots that have passed. An unavailable slot simply is not offered.
   */
  useEffect(() => {
    if (!open || !doctorId || !date) {
      setSlotState({ loading: false, slots: [], meta: null, error: null });
      return;
    }
    let cancelled = false;

    setSlotState((current) => ({ ...current, loading: true, error: null }));
    getDoctorSlots(doctorId, { date, durationMinutes: duration })
      .then((result) => {
        if (cancelled) return;
        setSlotState({
          loading: false,
          slots: result?.slots || [],
          meta: result,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSlotState({
          loading: false,
          slots: [],
          meta: null,
          error: getErrorMessage(err, "Could not load availability."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, doctorId, date, duration]);

  const submit = async () => {
    if (!isReschedule && !patientId) {
      toast.error("Select a patient first.");
      return;
    }
    if (!doctorId) {
      toast.error("Select a doctor.");
      return;
    }
    if (!startTime) {
      toast.error("Select a start time.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        doctorId,
        appointmentDate: date,
        startTime,
        durationMinutes: Number(duration),
        type,
        reason: reason.trim() || undefined,
      };
      if (!isReschedule) payload.patientId = patientId;

      const result = isReschedule
        ? await rescheduleAppointment(appointment._id, payload)
        : await createAppointment(payload);

      toast.success(
        isReschedule
          ? `Appointment ${result.appointmentNo} rescheduled.`
          : `Appointment ${result.appointmentNo} booked for ${result.patientName}.`
      );
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, isReschedule ? "Could not reschedule." : "Could not book this appointment."));
    } finally {
      setSaving(false);
    }
  };

  const availableSlots = slotState.slots.filter((slot) => slot.available);

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title={isReschedule ? "Reschedule appointment" : "Book an appointment"}
      description={
        isReschedule
          ? `${appointment.appointmentNo} · ${appointment.patientName} · currently ${formatTime12(appointment.startTime)}`
          : "Booked against the doctor's published clinic hours. The patient is notified automatically."
      }
      closeDisabled={saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-full bg-teal-mid px-5 py-2 text-sm font-bold text-white transition hover:bg-teal-deep disabled:opacity-60"
          >
            {saving ? "Saving…" : isReschedule ? "Save changes" : "Book appointment"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {isReschedule ? (
          <div className="rounded-2xl bg-lavender-pale px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Patient</p>
            <p className="mt-0.5 text-sm font-semibold text-deept">{appointment.patientName}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="appt-patient" className="mb-1.5 block text-sm font-semibold text-deept">
              Patient
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                id="appt-patient"
                type="text"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  if (e.target.value !== patientQuery) setPatientId("");
                }}
                placeholder="Search patients by name, email or phone"
                className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
              />
            </div>

            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-deept/10">
              {patientsLoading ? (
                <p className="px-4 py-3 text-sm text-ink-soft">Searching…</p>
              ) : patientOptions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-soft">No patients match that search.</p>
              ) : (
                patientOptions.map((patient) => (
                  <button
                    key={patient._id}
                    type="button"
                    onClick={() => {
                      setPatientId(patient._id);
                      setPatientQuery(patient.name);
                    }}
                    className={`flex w-full items-center gap-3 border-b border-deept/5 px-4 py-2.5 text-left last:border-0 transition hover:bg-teal-pale/30 ${
                      patientId === patient._id ? "bg-teal-pale" : ""
                    }`}
                  >
                    <UserRound className="size-4 shrink-0 text-teal-mid" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{patient.name}</span>
                      <span className="block truncate text-xs text-ink-soft">{patient.email}</span>
                    </span>
                    {patientId === patient._id && <span className="text-xs font-bold text-teal-mid">Selected</span>}
                  </button>
                ))
              )}
            </div>
            {patientId && <p className="mt-1.5 text-xs text-ink-soft">Booking for the selected patient.</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="appt-doctor" className="mb-1.5 block text-sm font-semibold text-deept">
              Doctor
            </label>
            <select
              id="appt-doctor"
              value={doctorId}
              onChange={(e) => {
                setDoctorId(e.target.value);
                setStartTime("");
              }}
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            >
              <option value="">Select a doctor</option>
              {doctors.map((doctor) => (
                <option key={doctor._id} value={doctor._id}>
                  {doctor.name}
                  {doctor.department ? ` · ${doctor.department}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="appt-type" className="mb-1.5 block text-sm font-semibold text-deept">
              Appointment type
            </label>
            <select
              id="appt-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            >
              {APPOINTMENT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {humanise(option)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="appt-date" className="mb-1.5 block text-sm font-semibold text-deept">
              Date
            </label>
            <input
              id="appt-date"
              type="date"
              value={date}
              min={todayInputValue()}
              onChange={(e) => {
                setDate(e.target.value);
                setStartTime("");
              }}
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            />
          </div>

          <div>
            <label htmlFor="appt-duration" className="mb-1.5 block text-sm font-semibold text-deept">
              Duration (minutes)
            </label>
            <input
              id="appt-duration"
              type="number"
              min={5}
              max={480}
              step={5}
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
                setStartTime("");
              }}
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            />
          </div>
        </div>

        {/* Slot picker - availability is the server's answer, not a guess. */}
        <div>
          <label htmlFor="appt-time" className="mb-1.5 block text-sm font-semibold text-deept">
            Start time
          </label>
          {!doctorId || !date ? (
            <p className="rounded-xl bg-softteal px-4 py-3 text-sm text-ink-soft">
              Choose a doctor and a date to see available slots.
            </p>
          ) : slotState.loading ? (
            <p className="rounded-xl bg-softteal px-4 py-3 text-sm text-ink-soft">Checking availability…</p>
          ) : slotState.error ? (
            <p className="rounded-xl bg-coral-pale px-4 py-3 text-sm text-coral-dark">{slotState.error}</p>
          ) : availableSlots.length === 0 ? (
            <p className="rounded-xl bg-coral-pale px-4 py-3 text-sm text-coral-dark">
              {slotState.meta?.usingDefaultSchedule
                ? "No bookable slots. This doctor has no published schedule, so the default clinic hours apply."
                : `No free slots on this date. ${slotState.meta?.clinicHours ? `Clinic hours are ${formatTime12(slotState.meta.clinicHours.startTime)} to ${formatTime12(slotState.meta.clinicHours.endTime)}.` : "The doctor is not available on this day."}`}
            </p>
          ) : (
            <select
              id="appt-time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            >
              <option value="">Select a time</option>
              {availableSlots.map((slot) => (
                <option key={slot.startMinutes} value={slot.startTime}>
                  {formatTime12(slot.startTime)} – {formatTime12(slot.endTime)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="appt-reason" className="mb-1.5 block text-sm font-semibold text-deept">
            Reason (optional)
          </label>
          <textarea
            id="appt-reason"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Persistent chest pain for two weeks"
            className="w-full rounded-2xl border border-deept/20 px-4 py-2.5 text-sm outline-none transition focus:border-teal-mid"
          />
        </div>
      </div>
    </Modal>
  );
}

export default function AppointmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState("list");

  const [filters, setFilters] = useState({ scope: "", status: "", type: "", search: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], pagination: null });
  const [queue, setQueue] = useState(null);
  const [queueDate, setQueueDate] = useState(todayInputValue());
  const [doctors, setDoctors] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  const pagination = result.pagination || { page: 1, totalPages: 1, total: 0 };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (view === "queue") {
        setQueue(await getAppointmentQueue({ date: queueDate }));
      } else {
        const data = await getAppointments({
          scope: filters.scope || undefined,
          status: filters.status || undefined,
          type: filters.type || undefined,
          search: filters.search.trim() || undefined,
          page,
          limit: 20,
        });
        setResult(data);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not load appointments."));
    } finally {
      setIsLoading(false);
    }
  }, [view, filters.scope, filters.status, filters.type, filters.search, page, queueDate]);

  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_CREATED, load);
  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_UPDATED, load);
  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_STATUS_CHANGED, load);
  useSocketEvent(SOCKET_EVENTS.PATIENT_REGISTERED, load);
  useSocketEvent("connect", load);

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);

  // Doctor list is needed by the booking form; it is small and rarely changes.
  useEffect(() => {
    getDoctors({ limit: 100 })
      .then((data) => setDoctors(data?.items || []))
      .catch(() => setDoctors([]));
  }, []);

  // The dashboard links here with ?new=1 to open the booking dialog directly.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setFormOpen(true);
      setEditing(null);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const refresh = async () => {
    await load();
  };

  const applyStatus = async (appointment, status) => {
    setBusyId(appointment._id);
    try {
      await updateAppointmentStatus(appointment._id, status);
      toast.success(`${appointment.appointmentNo} marked ${humanise(status).toLowerCase()}.`);
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update the status."));
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (appointment) => {
    setDetail(appointment);
    setDetailLoading(true);
    try {
      setDetail(await getAppointment(appointment._id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load this appointment."));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusyId(cancelling._id);
    try {
      await cancelAppointment(cancelling._id, cancelReason.trim() || undefined);
      toast.success(`${cancelling.appointmentNo} cancelled. The patient and doctor were notified.`);
      setCancelling(null);
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not cancel this appointment."));
    } finally {
      setBusyId(null);
    }
  };

  const rows = result.items || [];
  const queueDoctors = queue?.doctors || [];

  const summaryTiles = useMemo(
    () => [
      { label: "Appointments", value: queue?.totals?.appointments ?? pagination.total ?? 0 },
      { label: "Waiting", value: queue?.totals?.waiting ?? rows.filter((row) => ["SCHEDULED", "CONFIRMED"].includes(row.status)).length },
      { label: "In consultation", value: queue?.totals?.inConsultation ?? rows.filter((row) => row.status === "IN_CONSULTATION").length },
      { label: "Completed", value: queue?.totals?.completed ?? rows.filter((row) => row.status === "COMPLETED").length },
    ],
    [queue, pagination.total, rows]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Appointments</h1>
          <p className="text-base font-medium text-ink-soft">
            Book, reschedule and track every visit across all doctors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-deept/15 bg-white px-4 text-sm font-semibold text-teal-deep transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-teal-mid px-5 text-sm font-semibold text-white shadow-lg shadow-teal-mid/30 transition hover:-translate-y-0.5 hover:bg-teal-deep"
          >
            <Plus className="size-4" />
            New appointment
          </button>
        </div>
      </div>

      {/* View switch */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "list", label: "All appointments", icon: CalendarDays },
          { value: "queue", label: "Waiting room", icon: ListChecks },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setView(option.value)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              view === option.value
                ? "bg-teal-mid text-white shadow-md shadow-teal-mid/30"
                : "border border-deept/15 bg-white text-ink-soft hover:border-teal-mid/40 hover:text-teal-mid"
            }`}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        ))}
        {view === "queue" && (
          <input
            type="date"
            value={queueDate}
            onChange={(e) => setQueueDate(e.target.value)}
            aria-label="Queue date"
            className="h-10 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid"
          />
        )}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryTiles.map((tile, index) => (
          <div
            key={tile.label}
            className={`rounded-2xl border border-deept/5 ${SUMMARY_TILE_BG[index % SUMMARY_TILE_BG.length]} p-5`}
          >
            <p className="text-sm font-medium text-ink-soft">{tile.label}</p>
            <p className="mt-1 font-heading text-2xl font-bold text-teal-deep">{tile.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} columns={6} />
      ) : error ? (
        <ErrorState title="Could not load appointments" description={error} onRetry={load} />
      ) : view === "queue" ? (
        queueDoctors.length === 0 ? (
          <p className="rounded-2xl border border-deept/10 bg-white px-6 py-10 text-center text-sm text-ink-soft">
            No appointments are booked for {formatDate(queueDate, "DD MMM YYYY")}.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {queueDoctors.map((entry) => (
              <section key={entry.doctor?._id} className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-deept/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-teal-deep">{entry.doctor?.name}</h2>
                    <p className="text-sm text-ink-soft">
                      {entry.total} booked · {entry.waiting} waiting · longest wait {entry.longestWaitMinutes} min
                    </p>
                  </div>
                </div>

                <ul className="divide-y divide-deept/5">
                  {entry.appointments.map((appointment) => (
                    <li key={appointment._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-pale text-xs font-bold text-teal-mid">
                            {appointment.sequence}
                          </span>
                          <p className="font-semibold text-ink">{appointment.patientName}</p>
                          <StatusBadge status={appointment.status} />
                          {appointment.runningLate && (
                            <span className="rounded-full bg-softteal px-2 py-0.5 text-xs font-semibold text-teal-mid">
                              running late
                            </span>
                          )}
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)}
                          </span>
                          <span>· expected {formatTime12(appointment.expectedStartTime)}</span>
                          <span>· {appointment.waitMinutes} min wait</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <StatusActions appointment={appointment} onStatus={applyStatus} busy={busyId === appointment._id} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {SCOPE_FILTERS.map((option) => (
                <button
                  key={option.value || "ALL"}
                  type="button"
                  onClick={() => {
                    setFilters((current) => ({ ...current, scope: option.value }));
                    setPage(1);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filters.scope === option.value
                      ? "bg-teal-mid text-white shadow-md shadow-teal-mid/30"
                      : "border border-deept/15 bg-white text-ink-soft hover:border-teal-mid/40 hover:text-teal-mid"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters((current) => ({ ...current, status: e.target.value }));
                  setPage(1);
                }}
                aria-label="Filter by status"
                className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid"
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value || "ALL"} value={option.value}>
                    {option.value ? humanise(option.value) : "All statuses"}
                  </option>
                ))}
              </select>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => {
                    setFilters((current) => ({ ...current, search: e.target.value }));
                    setPage(1);
                  }}
                  placeholder="Search number, patient or doctor"
                  className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                />
              </div>
            </div>
          </div>

          {/* List */}
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-deept/10 bg-white px-6 py-10 text-center text-sm text-ink-soft">
              {filters.search.trim()
                ? `Nothing matches "${filters.search.trim()}".`
                : "No appointments match these filters."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-deept/10 bg-softteal/50">
                      {["Reference", "Patient", "Doctor", "Date & time", "Type", "Status", "Actions"].map((header) => (
                        <th
                          key={header}
                          scope="col"
                          className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {rows.map((appointment) => (
                      <tr key={appointment._id} className="transition-colors hover:bg-teal-pale/30">
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{appointment.appointmentNo}</td>
                        <td className="px-5 py-4 font-semibold text-ink">{appointment.patientName}</td>
                        <td className="px-5 py-4 text-ink-soft">{appointment.doctorName}</td>
                        <td className="px-5 py-4 text-ink-soft">
                          <span className="block">{formatDate(appointment.appointmentDate, "DD MMM YYYY")}</span>
                          <span className="block text-xs">
                            {formatTime12(appointment.startTime)} – {formatTime12(appointment.endTime)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-ink-soft">{humanise(appointment.type)}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={appointment.status} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDetail(appointment)}
                              className="inline-flex items-center gap-1 rounded-full border border-lavender/50 px-2.5 py-1 text-xs font-bold text-lavender transition hover:bg-lavender-pale"
                            >
                              <Eye className="size-3" />
                              View
                            </button>
                            {canReschedule(appointment.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(appointment);
                                  setFormOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-teal/30 px-2.5 py-1 text-xs font-bold text-teal-mid transition hover:bg-teal-pale"
                              >
                                <CalendarClock className="size-3" />
                                Reschedule
                              </button>
                            )}
                            {canCancel(appointment.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelling(appointment);
                                  setCancelReason("");
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-coral/40 px-2.5 py-1 text-xs font-bold text-coral-dark transition hover:bg-coral-pale"
                              >
                                <Ban className="size-3" />
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-ink-soft">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} appointments
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Booking / rescheduling */}
      <AppointmentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
        doctors={doctors}
        appointment={editing}
      />

      {/* Detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail?.appointmentNo || "Appointment"}
        description={detail ? `${detail.patientName} with ${detail.doctorName}` : undefined}
        closeDisabled={detailLoading}
      >
        {detailLoading || !detail ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Status", value: humanise(detail.status) },
                { label: "Type", value: humanise(detail.type) },
                { label: "Date", value: formatDate(detail.appointmentDate, "DD MMM YYYY") },
                { label: "Time", value: `${formatTime12(detail.startTime)} – ${formatTime12(detail.endTime)}` },
                { label: "Booked on", value: formatDateTime(detail.createdAt) },
                { label: "Patient contact", value: detail.patient?.phone || detail.patient?.contactNumber || detail.patient?.email || "—" },
              ].map((field) => (
                <div key={field.label} className="rounded-xl border border-deept/10 px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{field.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-deept">{field.value}</p>
                </div>
              ))}
            </div>

            {detail.reason && (
              <div className="rounded-xl bg-lavender-pale px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Reason</p>
                <p className="mt-0.5 text-sm text-ink">{detail.reason}</p>
              </div>
            )}

            {detail.cancelledReason && (
              <div className="rounded-xl bg-coral-pale px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Cancellation reason</p>
                <p className="mt-0.5 text-sm text-ink">{detail.cancelledReason}</p>
              </div>
            )}

            {detail.invoice ? (
              <div className="rounded-xl border border-deept/10 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Linked invoice</p>
                <p className="mt-0.5 text-sm font-semibold text-deept">
                  {detail.invoice.invoiceNo} · Rs. {detail.invoice.total} · {humanise(detail.invoice.status)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-ink-soft">No invoice has been issued for this appointment yet.</p>
            )}

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Move this appointment on</p>
              <StatusActions appointment={detail} onStatus={applyStatus} busy={busyId === detail._id} />
            </div>
          </div>
        )}
      </Modal>

      {/* Cancellation */}
      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        size="sm"
        title="Cancel this appointment?"
        description={
          cancelling
            ? `${cancelling.appointmentNo} · ${cancelling.patientName} · ${formatDate(
                cancelling.appointmentDate,
                "DD MMM YYYY"
              )} at ${formatTime12(cancelling.startTime)}`
            : undefined
        }
        closeDisabled={Boolean(busyId)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCancelling(null)}
              className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale"
            >
              Keep appointment
            </button>
            <button
              type="button"
              onClick={confirmCancel}
              disabled={Boolean(busyId)}
              className="rounded-full bg-coral px-5 py-2 text-sm font-bold text-white transition hover:bg-coral-dark disabled:opacity-60"
            >
              {busyId ? "Cancelling…" : "Cancel appointment"}
            </button>
          </>
        }
      >
        <p className="text-sm font-medium text-ink-soft">
          The patient and the doctor are both notified. A completed appointment cannot be cancelled.
        </p>
        <label htmlFor="cancel-reason" className="mb-1.5 mt-4 block text-sm font-semibold text-deept">
          Reason (optional)
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          maxLength={300}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="e.g. Doctor called in for an emergency"
          className="w-full rounded-2xl border border-deept/20 px-4 py-2.5 text-sm outline-none transition focus:border-teal-mid"
        />
      </Modal>
    </div>
  );
}