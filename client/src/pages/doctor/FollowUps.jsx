import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, RefreshCw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorResponsiveList,
  DoctorTrustNote,
  StatusBadge,
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
} from "./doctorUi";

/**
 * Follow-ups (FR-DR-09).
 *
 * A follow-up is not a separate record: it is an appointment of type FOLLOW_UP
 * carrying `followUpOf`, the consultation that asked for it. Keeping that link
 * is what lets the patient timeline walk consultation -> follow-up -> next
 * consultation, so this screen only ever books follow-ups from a consultation
 * that exists rather than letting the type be picked freely.
 */

const filters = [
  { value: "", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
];

export default function DoctorFollowUps() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("");
  const [busyId, setBusyId] = useState(null);

  // Booking a follow-up needs the consultation being followed up, so the dialog
  // offers the doctor's own completed consultations rather than a free-text id.
  const [bookingOpen, setBookingOpen] = useState(false);
  const [consultations, setConsultations] = useState([]);
  const [form, setForm] = useState({ consultation: "", appointmentDate: "", startTime: "09:00", durationMinutes: "20", reason: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorApi.getAppointments({
        type: "FOLLOW_UP",
        limit: 100,
        ...(scope ? { scope } : {}),
      });
      setRows(result.items);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const openBooking = async () => {
    setErrors({});
    setForm({ consultation: "", appointmentDate: "", startTime: "09:00", durationMinutes: "20", reason: "" });
    setBookingOpen(true);
    try {
      const result = await doctorApi.getConsultations({ status: "COMPLETED", limit: 50 });
      setConsultations(result.items || []);
    } catch (loadError) {
      toast.error(getDoctorApiError(loadError));
    }
  };

  const patch = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    if (saving) return;
    const next = {};
    const parent = consultations.find((item) => item._id === form.consultation);
    if (!parent) next.consultation = "Choose the consultation being followed up";
    if (!form.appointmentDate) next.appointmentDate = "Choose a date";
    else if (dayStartIso(form.appointmentDate) < new Date().toISOString()) next.appointmentDate = "That date is in the past";
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(form.startTime)) next.startTime = "Use 24-hour time, e.g. 09:30";
    const duration = Number(form.durationMinutes);
    if (!Number.isFinite(duration) || duration < 5 || duration > 240) next.durationMinutes = "Between 5 and 240 minutes";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await doctorApi.bookAppointment({
        patient: parent.patient?._id || parent.patient?.id,
        type: "FOLLOW_UP",
        followUpOf: parent._id,
        appointmentDate: dayStartIso(form.appointmentDate),
        startTime: form.startTime,
        durationMinutes: duration,
        reason: form.reason.trim() || undefined,
      });
      toast.success("Follow-up booked");
      setBookingOpen(false);
      await load();
    } catch (saveError) {
      toast.error(getDoctorApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (appointment, next) => {
    setBusyId(appointment._id);
    try {
      await doctorApi.updateAppointmentStatus(appointment._id, next);
      toast.success(`Follow-up ${humanise(next).toLowerCase()}`);
      await load();
    } catch (actionError) {
      toast.error(getDoctorApiError(actionError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DoctorPageShell
      title="Follow-ups"
      description="Patients you asked to come back, and the consultation each one belongs to."
      actions={
        <>
          <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={openBooking} className={CHIP_PRIMARY}>
            <CalendarPlus className="size-4" /> Book follow-up
          </button>
        </>
      }
    >
      <DoctorCard title="Follow-up list" description={loading ? "Loading..." : `${rows.length} follow-up(s)`}>
        <div className="mb-5 flex flex-wrap gap-2">
          {filters.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => setScope(option.value)}
              className={
                scope === option.value
                  ? "rounded-full bg-teal-deep px-3 py-1.5 text-xs font-bold text-white"
                  : "rounded-full border border-deept/15 bg-white px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <DoctorResponsiveList
          rows={rows}
          loading={loading}
          error={error}
          empty={!rows.length}
          emptyMessage="No follow-ups booked. Book one from a completed consultation."
          columns={[
            {
              header: "Appointment",
              primary: true,
              render: (item) => (
                <>
                  <p className="font-mono text-xs font-bold text-teal-mid">{item.appointmentNo}</p>
                  <p className="text-xs text-ink-soft">{item.patient?.reference}</p>
                </>
              ),
            },
            {
              header: "Patient",
              render: (item) => <span className="font-semibold text-ink">{item.patient?.name || "Patient"}</span>,
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
            {
              header: "Because",
              hideOnMobile: true,
              render: (item) => (
                <span className="block max-w-[240px] truncate text-ink-soft" title={item.reason || ""}>
                  {item.reason || "Review progress"}
                </span>
              ),
            },
            { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
          ]}
          actions={(item) => {
            const current = String(item.status || "").toUpperCase();
            const moves = (NEXT_APPOINTMENT_STATUSES[current] || []).filter((next) => next !== "IN_CONSULTATION");
            return (
              <>
                {["SCHEDULED", "CONFIRMED", "IN_CONSULTATION"].includes(current) && (
                  <Link to={`/doctor/consultations?appointment=${item._id}&patient=${item.patient?._id}`} className={CHIP_BUTTON}>
                    <Stethoscope className="size-3.5" /> {current === "IN_CONSULTATION" ? "Continue" : "Start visit"}
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
                    {busyId === item._id ? "..." : humanise(next)}
                  </button>
                ))}
              </>
            );
          }}
        />
      </DoctorCard>

      <Modal
        open={bookingOpen}
        onClose={() => (saving ? undefined : setBookingOpen(false))}
        title="Book a follow-up"
        description="A follow-up stays linked to the consultation that requested it."
        closeDisabled={saving}
        footer={
          <>
            <button type="button" onClick={() => setBookingOpen(false)} disabled={saving} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? "Booking..." : "Book follow-up"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="followup-consultation" className={LABEL_CLASS}>
              Consultation being followed up <span className="text-coral-dark">*</span>
            </label>
            <select
              id="followup-consultation"
              value={form.consultation}
              onChange={patch("consultation")}
              className={`${FIELD_CLASS} ${errors.consultation ? "border-coral" : ""}`}
            >
              <option value="">Choose a completed consultation...</option>
              {consultations.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.patient?.name} · {item.consultationNo} · {formatDate(item.createdAt)} · {item.diagnosis || "No diagnosis"}
                </option>
              ))}
            </select>
            {errors.consultation && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.consultation}</p>}
            {!consultations.length && (
              <p className="mt-1 text-xs text-ink-soft">
                No completed consultations yet. Complete a visit first, then book its follow-up.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="followup-date" className={LABEL_CLASS}>
                Date <span className="text-coral-dark">*</span>
              </label>
              <input
                id="followup-date"
                type="date"
                min={toDateInput(new Date())}
                value={form.appointmentDate}
                onChange={patch("appointmentDate")}
                className={`${FIELD_CLASS} ${errors.appointmentDate ? "border-coral" : ""}`}
              />
              {errors.appointmentDate && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.appointmentDate}</p>}
            </div>
            <div>
              <label htmlFor="followup-time" className={LABEL_CLASS}>
                Start time <span className="text-coral-dark">*</span>
              </label>
              <input
                id="followup-time"
                type="time"
                value={form.startTime}
                onChange={patch("startTime")}
                className={`${FIELD_CLASS} ${errors.startTime ? "border-coral" : ""}`}
              />
              {errors.startTime && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.startTime}</p>}
            </div>
            <div>
              <label htmlFor="followup-duration" className={LABEL_CLASS}>
                Minutes
              </label>
              <input
                id="followup-duration"
                type="number"
                min="5"
                max="240"
                step="5"
                value={form.durationMinutes}
                onChange={patch("durationMinutes")}
                className={`${FIELD_CLASS} ${errors.durationMinutes ? "border-coral" : ""}`}
              />
              {errors.durationMinutes && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.durationMinutes}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="followup-reason" className={LABEL_CLASS}>
              What is being reviewed
            </label>
            <input
              id="followup-reason"
              maxLength={300}
              value={form.reason}
              onChange={patch("reason")}
              placeholder="e.g. Repeat CBC after two weeks of treatment"
              className={FIELD_CLASS}
            />
          </div>
        </div>
      </Modal>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
