import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, CalendarX, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { patientApi, getApiError } from "@/services/patientApi";
import {
  PatientCard,
  PatientPageShell,
  PatientResponsiveList,
  PatientTrustNote,
  StatusBadge,
  CHIP_BUTTON,
  CHIP_PRIMARY,
  DANGER_BUTTON,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  canCancel,
  dayStartIso,
  formatDate,
  formatSlotRange,
  humanise,
  toDateInput,
} from "./patientUi";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

/**
 * Appointments (FR-PT-01).
 *
 * Booking is a real three-step flow against the server:
 *   1. choose a doctor from the approved directory,
 *   2. choose a day, which asks `/patient/appointments/availability` for that
 *      doctor's real free slots,
 *   3. confirm - the server re-checks the slot, so a race loses with a clear 409
 *      rather than creating a double booking.
 *
 * The slots shown are derived server-side from appointments that already exist, so
 * a slot taken by a doctor from any module shows as unavailable here.
 */
export default function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [bookingOpen, setBookingOpen] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const params = scope === "all" ? {} : { scope };
        setAppointments(await patientApi.getAppointments(params));
        setError("");
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scope]
  );

  useEffect(() => {
    load();
  }, [load]);

  const closeBooking = () => {
    if (working) return;
    setBookingOpen(false);
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    setWorking(true);
    try {
      await patientApi.cancelAppointment(cancelling.id, cancelReason.trim() || undefined);
      toast.success("Appointment cancelled.");
      setCancelling(null);
      setCancelReason("");
      await load({ quiet: true });
    } catch (requestError) {
      toast.error(getApiError(requestError));
    } finally {
      setWorking(false);
    }
  };

  const columns = [
    {
      header: "Doctor",
      primary: true,
      render: (row) => (
        <span className="font-semibold text-teal-deep">{row.doctor?.name || "Doctor"}</span>
      ),
    },
    {
      header: "Department",
      render: (row) => row.doctor?.department || "-",
    },
    {
      header: "Date & time",
      primary: true,
      render: (row) => (
        <span>
          {formatDate(row.appointmentDate)}
          <span className="block text-xs text-ink-soft">{formatSlotRange(row)}</span>
        </span>
      ),
    },
    {
      header: "Type",
      render: (row) => humanise(row.type),
    },
    {
      header: "Reason",
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{row.reason || "-"}</span>,
    },
    {
      header: "Status",
      render: (row) => <StatusBadge status={humanise(row.status)} />,
    },
  ];

  return (
    <PatientPageShell
      title="My appointments"
      description="Book a consultation with a doctor and track the visits you already have."
      actions={
        <>
          <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button type="button" onClick={() => setBookingOpen(true)} className={PRIMARY_BUTTON}>
            <CalendarPlus className="size-4" />
            Book appointment
          </button>
        </>
      }
    >
      <PatientCard
        title="Appointments"
        description="Everything you have booked, newest first."
        action={
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setScope(option.key)}
                className={scope === option.key ? CHIP_PRIMARY : CHIP_BUTTON}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        <PatientResponsiveList
          columns={columns}
          rows={appointments}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          empty={!loading && !error && appointments.length === 0}
          emptyMessage={
            scope === "upcoming"
              ? "You have no upcoming appointments. Book one when you are ready."
              : "No appointments to show."
          }
          actions={(row) =>
            canCancel(row) ? (
              <button
                type="button"
                onClick={() => {
                  setCancelling(row);
                  setCancelReason("");
                }}
                className={DANGER_BUTTON.replace("px-4 py-2.5", "px-3 py-2")}
              >
                <CalendarX className="size-4" />
                Cancel
              </button>
            ) : (
              <span className="text-xs text-ink-soft">Not cancellable</span>
            )
          }
        />
        <div className="mt-4">
          <PatientTrustNote />
        </div>
      </PatientCard>

      <BookingDialog
        open={bookingOpen}
        onClose={closeBooking}
        onBooked={async () => {
          setBookingOpen(false);
          await load({ quiet: true });
        }}
      />

      <Modal
        open={Boolean(cancelling)}
        onClose={() => !working && setCancelling(null)}
        title="Cancel this appointment?"
        description={
          cancelling
            ? `${cancelling.doctor?.name || "Your doctor"} on ${formatDate(cancelling.appointmentDate)} at ${formatSlotRange(cancelling)}`
            : ""
        }
        size="sm"
        closeDisabled={working}
        footer={
          <>
            <button type="button" onClick={() => setCancelling(null)} disabled={working} className={SECONDARY_BUTTON}>
              Keep appointment
            </button>
            <button type="button" onClick={confirmCancel} disabled={working} className={DANGER_BUTTON}>
              {working ? "Cancelling..." : "Cancel appointment"}
            </button>
          </>
        }
      >
        <label htmlFor="cancel-reason" className={LABEL_CLASS}>
          Reason (optional)
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          maxLength={300}
          placeholder="Let the clinic know why, if you would like."
          className={`${FIELD_CLASS} h-auto py-2.5`}
        />
      </Modal>
    </PatientPageShell>
  );
}

/* -------------------------------------------------------------- booking ---- */

/**
 * The booking dialog.
 *
 * Split out of the page so its state (doctors, chosen day, slot grid) resets
 * cleanly each time the dialog opens, instead of leaving a stale doctor or day
 * selected behind the modal.
 */
function BookingDialog({ open, onClose, onBooked }) {
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [availability, setAvailability] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadingDoctors(true);
    patientApi
      .getDoctors()
      .then((items) => {
        setDoctors(items || []);
        if (items?.length === 1) setDoctorId(items[0].id || items[0]._id || "");
        setLoadingDoctors(false);
      })
      .catch((requestError) => {
        setSlotError(getApiError(requestError));
        setLoadingDoctors(false);
      });
  }, [open]);

  // Availability follows the doctor and the day: both are inputs to which slots
  // are free, so either change invalidates the chosen slot.
  useEffect(() => {
    if (!open || !doctorId || !date) {
      setAvailability(null);
      setSlot("");
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlotError("");
    patientApi
      .getAvailability({ doctorId, date: dayStartIso(date) })
      .then((data) => {
        if (cancelled) return;
        setAvailability(data);
        setSlot("");
      })
      .catch((requestError) => {
        if (cancelled) return;
        setAvailability(null);
        setSlotError(getApiError(requestError));
      })
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [open, doctorId, date]);

  const submit = async () => {
    if (!doctorId || !date || !slot) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await patientApi.bookAppointment({
        doctorId,
        appointmentDate: dayStartIso(date),
        startTime: slot,
        durationMinutes: 30,
        reason: reason.trim(),
        type: "CONSULTATION",
      });
      toast.success("Appointment requested.");
      setReason("");
      await onBooked();
    } catch (requestError) {
      setSubmitError(getApiError(requestError));
      toast.error(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const slots = availability?.slots || [];
  const freeSlots = slots.filter((entry) => entry.available);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book an appointment"
      description="Pick a doctor and a time. Clinic hours are 09:00 to 17:00."
      closeDisabled={submitting}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !doctorId || !slot || reason.trim().length < 3}
            className={PRIMARY_BUTTON}
          >
            {submitting ? "Booking..." : "Confirm booking"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {submitError && (
          <p className="rounded-xl border border-coral/40 bg-coral-pale px-3 py-2 text-sm font-semibold text-coral-dark">
            {submitError}
          </p>
        )}

        <div>
          <label htmlFor="booking-doctor" className={LABEL_CLASS}>
            Doctor
          </label>
          {loadingDoctors ? (
            <p className="text-sm text-ink-soft">Loading doctors...</p>
          ) : doctors.length === 0 ? (
            <p className="text-sm text-ink-soft">No doctors are available for booking right now.</p>
          ) : (
            <select
              id="booking-doctor"
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Choose a doctor</option>
              {doctors.map((doctor) => (
                <option key={doctor.id || doctor._id} value={doctor.id || doctor._id}>
                  {doctor.name}
                  {doctor.department ? ` - ${doctor.department}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="booking-date" className={LABEL_CLASS}>
            Date
          </label>
          <input
            id="booking-date"
            type="date"
            value={date}
            min={toDateInput()}
            onChange={(event) => setDate(event.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <span className={LABEL_CLASS}>Available times</span>
          {!doctorId ? (
            <p className="text-sm text-ink-soft">Choose a doctor to see their free slots.</p>
          ) : loadingSlots ? (
            <p className="text-sm text-ink-soft">Checking availability...</p>
          ) : slotError ? (
            <p className="text-sm font-semibold text-coral-dark">{slotError}</p>
          ) : freeSlots.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No free slots on this day for {availability?.doctor?.name || "this doctor"}. Try another date.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((entry) => (
                <button
                  key={entry.startTime}
                  type="button"
                  disabled={!entry.available}
                  onClick={() => setSlot(entry.startTime)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    slot === entry.startTime
                      ? "border-teal-mid bg-teal-deep text-white"
                      : "border-deept/15 bg-white text-teal-deep hover:bg-teal-pale"
                  }`}
                  title={entry.past ? "This time has passed" : entry.booked ? "Already booked" : undefined}
                >
                  {entry.startTime}
                </button>
              ))}
            </div>
          )}
          {availability && (
            <p className="mt-2 text-xs text-ink-soft">
              Clinic hours {availability.clinicHours?.startTime} to {availability.clinicHours?.endTime}. Greyed-out
              times are taken or have passed.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="booking-reason" className={LABEL_CLASS}>
            Reason for visit
          </label>
          <textarea
            id="booking-reason"
            rows={3}
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Briefly describe your symptoms or what you need help with."
            className={`${FIELD_CLASS} h-auto py-2.5`}
          />
          <p className="mt-1 text-xs text-ink-soft">At least 3 characters. Your doctor sees this when you arrive.</p>
        </div>
      </div>
    </Modal>
  );
}