import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarPlus, RefreshCw, Search, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorResponsiveList,
  DoctorTrustNote,
  StatusBadge,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  NEXT_APPOINTMENT_STATUSES,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  CHIP_BUTTON,
  CHIP_PRIMARY,
  CHIP_DANGER,
  formatDate,
  formatSlot,
  formatSlotEnd,
  humanise,
  toDateInput,
  dayStartIso,
  ageFromDateOfBirth,
} from "./doctorUi";


/**
 * Appointments (FR-DR-01) and follow-up bookings (FR-DR-09).
 *
 * Everything shown here is scoped server-side to the signed-in doctor's care
 * team - the client sends no doctor id and the filter bar is a convenience, not
 * the authorization boundary.
 */

const SCOPES = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const emptyBooking = {
  patient: "",
  appointmentDate: toDateInput(new Date()),
  startTime: "09:00",
  durationMinutes: "30",
  type: "CONSULTATION",
  reason: "",
};

export default function DoctorAppointments() {
  const [params, setParams] = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [scope, setScope] = useState(params.get("scope") || "today");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  // Consultations and the patient record deep-link here with ?patient=<id>.
  const [patientFilter, setPatientFilter] = useState(params.get("patient") || "");

  const [patients, setPatients] = useState([]);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [booking, setBooking] = useState(emptyBooking);
  const [bookingErrors, setBookingErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // The dashboard deep-links here with a preset scope, and Consultations / the
  // patient record deep-link with ?patient=<id>.
  useEffect(() => {
    const requestedScope = params.get("scope");
    const requestedPatient = params.get("patient");
    if (requestedScope) setScope(requestedScope);
    // "This patient's appointments" means every visit, so fall back to the
    // unscoped list instead of leaving them on today's view, which is usually
    // empty for a patient whose visit is next week.
    else if (requestedPatient) setScope("all");
    setPatientFilter(requestedPatient || "");
  }, [params]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorApi.getAppointments({
        scope,
        limit: 100,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(date ? { date } : {}),
        ...(patientFilter ? { patient: patientFilter } : {}),
        // One character matches nearly every patient; wait for two so the box
        // does not fire a request per keystroke.
        ...(search.trim().length >= 2 ? { search: search.trim() } : {}),
      });
      setAppointments(result.items);
      setPagination(result.pagination);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [scope, status, type, date, search, patientFilter]);

  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_CREATED, load);
  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_UPDATED, load);
  useSocketEvent(SOCKET_EVENTS.APPOINTMENT_STATUS_CHANGED, load);
  useSocketEvent(SOCKET_EVENTS.PATIENT_REGISTERED, load);
  useSocketEvent("connect", load);

  // Searching runs on the server, so it is debounced rather than filtering a
  // stale in-memory list that only holds the first page.
  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // The booking dialog needs the assignable-patient list. Loaded once on open:
  // the care team changes rarely, and this is a short list, not a searchable
  // one - the appointment search box above covers large panels.
  const openBooking = async () => {
    setBooking(emptyBooking);
    setBookingErrors({});
    setBookingOpen(true);
    if (patients.length) return;
    try {
      setPatients(await doctorApi.getPatients({}));
    } catch (loadError) {
      toast.error(getDoctorApiError(loadError));
    }
  };

  const setField = (field) => (event) => {
    const { value } = event.target;
    setBooking((current) => ({ ...current, [field]: value }));
    setBookingErrors((current) => ({ ...current, [field]: undefined }));
  };

  /** Mirrors `validateBookAppointment` so the doctor sees the error before a round trip. */
  const validateBooking = () => {
    const next = {};
    if (!booking.patient) next.patient = "Choose a patient";
    if (!booking.appointmentDate) next.appointmentDate = "Choose a date";
    else if (dayStartIso(booking.appointmentDate) < new Date().toISOString()) {
      next.appointmentDate = "That date is in the past";
    }
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(booking.startTime)) next.startTime = "Use 24-hour time, e.g. 09:30";
    const duration = Number(booking.durationMinutes);
    if (!Number.isFinite(duration) || duration < 5 || duration > 240) next.durationMinutes = "Between 5 and 240 minutes";
    setBookingErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!validateBooking()) return;

    setSaving(true);
    try {
      const created = await doctorApi.bookAppointment({
        patient: booking.patient,
        appointmentDate: dayStartIso(booking.appointmentDate),
        startTime: booking.startTime,
        durationMinutes: Number(booking.durationMinutes),
        type: booking.type,
        reason: booking.reason.trim() || undefined,
      });
      toast.success(`Appointment ${created.appointmentNo} booked`);
      setBookingOpen(false);
      await load();
    } catch (saveError) {
      // A slot clash is a 409 and is the common case here, so the message from
      // the server is surfaced verbatim rather than replaced with a generic one.
      toast.error(getDoctorApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (appointment, next) => {
    setBusyId(appointment._id);
    try {
      await doctorApi.updateAppointmentStatus(appointment._id, next);
      toast.success(`Appointment marked ${humanise(next).toLowerCase()}`);
      await load();
    } catch (actionError) {
      toast.error(getDoctorApiError(actionError));
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => {
    setScope("today");
    setStatus("");
    setType("");
    setDate("");
    setSearch("");
    setPatientFilter("");
    setParams({});
  };

  const hasFilters = Boolean(status || type || date || search || patientFilter);
  const canStartConsultation = (appointment) =>
    ["SCHEDULED", "CONFIRMED", "IN_CONSULTATION"].includes(String(appointment.status || "").toUpperCase());

  return (
    <DoctorPageShell
      title="Appointments"
      description="Your clinic list. Booking, status changes and follow-ups all write to the shared appointment record."
      actions={
        <>
          <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button type="button" onClick={openBooking} className={CHIP_PRIMARY}>
            <CalendarPlus className="size-4" />
            Book appointment
          </button>
        </>
      }
    >
      <DoctorCard
        title="Clinic list"
        description={
          loading
            ? "Loading appointments..."
            : pagination
              ? `${pagination.total} ${pagination.total === 1 ? "appointment" : "appointments"} match the current filters.`
              : `${appointments.length} shown.`
        }
        action={
          hasFilters ? (
            <button type="button" onClick={clearFilters} className="text-sm font-bold text-teal-mid underline underline-offset-4">
              Clear filters
            </button>
          ) : null
        }
      >
        <div className="mb-5 flex flex-wrap gap-2">
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={
                scope === option.value
                  ? "rounded-full bg-teal-deep px-4 py-2 text-xs font-bold text-white"
                  : "rounded-full border border-deept/15 bg-white px-4 py-2 text-xs font-bold text-teal-deep hover:bg-teal-pale"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Deep-linked from a consultation or a patient record: say so, and offer a
            way back to the whole clinic list, otherwise the list silently looks short. */}
        {patientFilter && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-teal-mid/30 bg-teal-pale/60 px-4 py-3">
            <p className="text-sm font-bold text-teal-deep">Showing appointments for one patient</p>
            <Link to={`/doctor/patients/${patientFilter}`} className={`${CHIP_BUTTON} !bg-white`}>
              Open patient record
            </Link>
            <button
              type="button"
              onClick={() => {
                setPatientFilter("");
                setParams({});
              }}
              className="text-sm font-bold text-teal-mid underline underline-offset-4"
            >
              Show all patients
            </button>
          </div>
)}

        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, reason or appointment number..."
              aria-label="Search appointments"
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>
          <select value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filter by date" className={FIELD_CLASS}>
            <option value="">Any date</option>
            <option value={toDateInput(new Date())}>Today</option>
            <option value={toDateInput(new Date(Date.now() + 86400000))}>Tomorrow</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className={FIELD_CLASS}>
            <option value="">All statuses</option>
            {APPOINTMENT_STATUSES.map((option) => (
              <option key={option} value={option}>
                {humanise(option)}
              </option>
            ))}
          </select>
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by type" className={FIELD_CLASS}>
            <option value="">All types</option>
            {APPOINTMENT_TYPES.map((option) => (
              <option key={option} value={option}>
                {humanise(option)}
              </option>
            ))}
          </select>
        </div>

        <DoctorResponsiveList
          rows={appointments}
          loading={loading}
          error={error}
          empty={!appointments.length}
          emptyMessage={
            hasFilters || scope !== "all"
              ? "No appointments match these filters."
              : "You have no appointments booked yet."
          }
          columns={[
            {
              header: "Appointment",
              primary: true,
              render: (item) => (
                <>
                  <p className="font-mono text-xs font-bold text-teal-mid">{item.appointmentNo}</p>
                  <p className="text-xs text-ink-soft">{item.patient?.reference || String(item.patient?._id || "").slice(-6).toUpperCase()}</p>
                </>
              ),
            },
            {
              header: "Patient",
              render: (item) => {
                const age = ageFromDateOfBirth(item.patient?.dateOfBirth);
                return (
                  <>
                    <p className="font-semibold text-ink">{item.patient?.name || "Patient"}</p>
                    {age != null && <p className="text-xs text-ink-soft">{age} yrs · {humanise(item.patient?.gender)}</p>}
                  </>
                );
              },
            },
            {
              header: "When",
              render: (item) => (
                <span className="whitespace-nowrap text-ink">
                  {formatDate(item.appointmentDate)}
                  <span className="block font-mono text-xs text-ink-soft">
                    {formatSlot(item.startMinutes)} – {formatSlotEnd(item)}
                  </span>
                </span>
              ),
            },
            { header: "Type", render: (item) => <span className="text-ink-soft">{humanise(item.type)}</span> },
            {
              header: "Reason",
              hideOnMobile: true,
              render: (item) => (
                <span className="block max-w-[200px] truncate text-ink-soft" title={item.reason || ""}>
                  {item.reason || "-"}
                </span>
              ),
            },
            { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
          ]}
          actions={(item) => {
            const current = String(item.status || "").toUpperCase();
            // IN_CONSULTATION is reached through the consultation link below rather
            // than a bare status button, so the row does not offer the same move twice.
            const moves = (NEXT_APPOINTMENT_STATUSES[current] || []).filter((next) => next !== "IN_CONSULTATION");

            return (
              <>
                {canStartConsultation(item) && (
                  <Link to={`/doctor/consultations?appointment=${item._id}&patient=${item.patient?._id}`} className={CHIP_BUTTON}>
                    <Stethoscope className="size-3.5" />
                    {current === "IN_CONSULTATION" ? "Continue" : "Start consultation"}
                  </Link>
                )}
                {moves.map((next) => (
                  <button
                    key={next}
                    type="button"
                    disabled={busyId === item._id}
                    onClick={() => applyStatus(item, next)}
                    className={next === "CANCELLED" || next === "NO_SHOW" ? CHIP_DANGER : CHIP_PRIMARY}
                  >
                    {busyId === item._id ? "Saving..." : humanise(next)}
                  </button>
                ))}
                {!moves.length && !canStartConsultation(item) && (
                  <span className="self-center text-xs text-ink-soft">No further action</span>
                )}
              </>
            );
          }}
        />
      </DoctorCard>

      <Modal
        open={bookingOpen}
        onClose={() => (saving ? undefined : setBookingOpen(false))}
        title="Book an appointment"
        description="The slot is checked against your existing bookings before it is saved."
        closeDisabled={saving}
        footer={
          <>
            <button type="button" onClick={() => setBookingOpen(false)} disabled={saving} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="submit" form="book-appointment" disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? "Booking..." : "Book appointment"}
            </button>
          </>
        }
      >
        <form id="book-appointment" onSubmit={submitBooking} className="space-y-4" noValidate>
          <div>
            <label htmlFor="booking-patient" className={LABEL_CLASS}>
              Patient <span className="text-coral-dark">*</span>
            </label>
            <select
              id="booking-patient"
              value={booking.patient}
              onChange={setField("patient")}
              className={FIELD_CLASS}
              aria-invalid={Boolean(bookingErrors.patient)}
            >
              <option value="">Choose a patient...</option>
              {patients.map((patient) => (
                <option key={patient._id} value={patient._id}>
                  {patient.name} · {patient.reference || String(patient._id).slice(-6).toUpperCase()}
                </option>
              ))}
            </select>
            {bookingErrors.patient && <p className="mt-1 text-xs font-bold text-coral-dark">{bookingErrors.patient}</p>}
            {!patients.length && (
              <p className="mt-1 text-xs text-ink-soft">
                No patients are assigned to you yet. Patients appear here once an Admin adds you to their care team.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="booking-date" className={LABEL_CLASS}>
                Date <span className="text-coral-dark">*</span>
              </label>
              <input
                id="booking-date"
                type="date"
                value={booking.appointmentDate}
                onChange={setField("appointmentDate")}
                min={toDateInput(new Date())}
                className={FIELD_CLASS}
                aria-invalid={Boolean(bookingErrors.appointmentDate)}
              />
              {bookingErrors.appointmentDate && (
                <p className="mt-1 text-xs font-bold text-coral-dark">{bookingErrors.appointmentDate}</p>
              )}
            </div>
            <div>
              <label htmlFor="booking-time" className={LABEL_CLASS}>
                Start time <span className="text-coral-dark">*</span>
              </label>
              <input
                id="booking-time"
                type="time"
                value={booking.startTime}
                onChange={setField("startTime")}
                className={FIELD_CLASS}
                aria-invalid={Boolean(bookingErrors.startTime)}
              />
              {bookingErrors.startTime && <p className="mt-1 text-xs font-bold text-coral-dark">{bookingErrors.startTime}</p>}
            </div>
            <div>
              <label htmlFor="booking-duration" className={LABEL_CLASS}>
                Minutes
              </label>
              <input
                id="booking-duration"
                type="number"
                min="5"
                max="240"
                step="5"
                value={booking.durationMinutes}
                onChange={setField("durationMinutes")}
                className={FIELD_CLASS}
                aria-invalid={Boolean(bookingErrors.durationMinutes)}
              />
              {bookingErrors.durationMinutes && (
                <p className="mt-1 text-xs font-bold text-coral-dark">{bookingErrors.durationMinutes}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="booking-type" className={LABEL_CLASS}>
              Type
            </label>
            <select id="booking-type" value={booking.type} onChange={setField("type")} className={FIELD_CLASS}>
              {APPOINTMENT_TYPES.filter((option) => option !== "FOLLOW_UP").map((option) => (
                <option key={option} value={option}>
                  {humanise(option)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-soft">
              Follow-ups are booked from a completed consultation, so they stay linked to the visit that asked for them.
            </p>
          </div>

          <div>
            <label htmlFor="booking-reason" className={LABEL_CLASS}>
              Reason
            </label>
            <textarea
              id="booking-reason"
              rows={2}
              maxLength={300}
              value={booking.reason}
              onChange={setField("reason")}
              placeholder="What the patient is coming in for..."
              className="w-full rounded-xl border border-deept/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            />
          </div>
        </form>
      </Modal>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
