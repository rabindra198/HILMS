import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Stethoscope,
  Save,
  Pencil,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  BadgeCheck,
} from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Modal } from "@/components/common/Modal";
import {
  getDoctors,
  createDoctor,
  updateDoctor,
  getDoctorAvailability,
  replaceDoctorAvailability,
  getDoctorSlots,
} from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";
import { formatMoney, formatTime12, todayInputValue } from "@/lib/format";

/**
 * Doctor directory and published clinic hours (FR-AD-04).
 *
 * The schedule editor saves the whole week in ONE request rather than seven.
 * That is not a convenience: `replaceForDoctor` validates every window and every
 * already-booked appointment before writing anything, so a rejected schedule
 * leaves the doctor's existing hours untouched instead of half-applied.
 *
 * The consultation fee is editable here because it is a billing input - an
 * invoice prices a consultation line from `User.consultationFee`, so a doctor
 * with no fee cannot be billed for a consultation at all.
 */

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const DEFAULT_SLOT_MINUTES = 30;

const emptyWindow = (weekday) => ({
  key: `new-${weekday}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  weekday,
  startTime: "09:00",
  endTime: "17:00",
  slotMinutes: DEFAULT_SLOT_MINUTES,
  isActive: true,
  isNew: true,
});

/** Converts a server window into the editable row shape. */
const toDraft = (window) => ({ ...window, key: window._id, isNew: false });

/** One editable availability window. */
function WindowRow({ window, onChange, onRemove }) {
  return (
    <div className="grid grid-cols-2 items-end gap-2 rounded-xl border border-deept/10 p-3 sm:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Start</label>
        <input
          type="time"
          value={window.startTime}
          onChange={(e) => onChange({ ...window, startTime: e.target.value })}
          className="h-10 w-full rounded-lg border border-deept/15 px-2 text-sm outline-none focus:border-teal-mid"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">End</label>
        <input
          type="time"
          value={window.endTime}
          onChange={(e) => onChange({ ...window, endTime: e.target.value })}
          className="h-10 w-full rounded-lg border border-deept/15 px-2 text-sm outline-none focus:border-teal-mid"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Slot (min)</label>
        <input
          type="number"
          min={5}
          max={240}
          step={5}
          value={window.slotMinutes}
          onChange={(e) => onChange({ ...window, slotMinutes: e.target.value })}
          className="h-10 w-full rounded-lg border border-deept/15 px-2 text-sm outline-none focus:border-teal-mid"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(window)}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-coral/40 text-xs font-bold text-coral-dark transition hover:bg-coral-pale"
      >
        <Trash2 className="size-3.5" />
        Remove
      </button>
    </div>
  );
}

/** Professional details, including the billing-relevant consultation fee. */
function EditDoctorModal({ open, onClose, doctor, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    specialization: "",
    qualification: "",
    nmcNumber: "",
    consultationFee: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !doctor) return;
    setForm({
      name: doctor.name || "",
      email: doctor.email || "",
      phone: doctor.phone || doctor.contactNumber || "",
      department: doctor.department || "",
      specialization: doctor.specialization || "",
      qualification: doctor.qualification || "",
      nmcNumber: doctor.nmcNumber || "",
      consultationFee: doctor.consultationFee === null || doctor.consultationFee === undefined ? "" : String(doctor.consultationFee),
    });
  }, [open, doctor]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    setSaving(true);
    try {
      // An empty fee box means "bill this doctor manually", which the backend
      // accepts as an explicit null rather than a skipped field.
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
        specialization: form.specialization.trim() || null,
        qualification: form.qualification.trim() || null,
        nmcNumber: form.nmcNumber.trim() || null,
        consultationFee: form.consultationFee === "" ? null : Number(form.consultationFee),
      };
      await updateDoctor(doctor._id, payload);
      toast.success(`${payload.name}'s details updated.`);
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update this doctor."));
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div>
      <label htmlFor={`doc-${key}`} className="mb-1.5 block text-sm font-semibold text-deept">
        {label}
      </label>
      <input
        id={`doc-${key}`}
        value={form[key]}
        onChange={set(key)}
        {...props}
        className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title="Edit doctor details"
      description={doctor ? `${doctor.name} · ${doctor.reference}` : undefined}
      closeDisabled={saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-full bg-teal-mid px-5 py-2 text-sm font-bold text-white transition hover:bg-teal-deep disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Full name")}
        {field("email", "Email", { type: "email" })}
        {field("phone", "Contact number")}
        {field("nmcNumber", "NMC number")}
        {field("department", "Department")}
        {field("specialization", "Specialization")}
        <div className="sm:col-span-2">{field("qualification", "Qualification")}</div>
        {field("consultationFee", "Consultation fee (NPR)", { type: "number", min: 0, step: 1 })}
      </div>
      <p className="mt-4 rounded-2xl bg-lavender-pale px-4 py-3 text-xs font-medium text-ink-soft">
        The consultation fee prices the consultation line on every invoice raised for this doctor. Leave it blank to
        bill consultations manually.
      </p>
    </Modal>
  );
}

function AddDoctorModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    contactNumber: "",
    nmcNumber: "",
    department: "",
    specialization: "",
    qualification: "",
    consultationFee: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        email: "",
        contactNumber: "",
        nmcNumber: "",
        department: "",
        specialization: "",
        qualification: "",
        consultationFee: "",
      });
    }
  }, [open]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createDoctor({
        name: form.name.trim(),
        email: form.email.trim(),
        contactNumber: form.contactNumber.trim(),
        nmcNumber: form.nmcNumber.trim(),
        department: form.department.trim(),
        specialization: form.specialization.trim(),
        qualification: form.qualification.trim(),
        ...(form.consultationFee !== "" ? { consultationFee: Number(form.consultationFee) } : {}),
      });
      toast.success("Doctor account created. A temporary password has been emailed to the doctor.");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not create this doctor account."));
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, props = {}) => (
    <div>
      <label htmlFor={`new-doc-${key}`} className="mb-1.5 block text-sm font-semibold text-deept">
        {label}
      </label>
      <input
        id={`new-doc-${key}`}
        name={key}
        value={form[key]}
        onChange={set(key)}
        {...props}
        className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
      />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title="Add doctor"
      description="Create an approved doctor account. A temporary password will be generated and emailed."
      closeDisabled={saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-doctor-form"
            disabled={saving}
            className="rounded-full bg-teal-mid px-5 py-2 text-sm font-bold text-white transition hover:bg-teal-deep disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create doctor"}
          </button>
        </>
      }
    >
      <form id="add-doctor-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {field("name", "Full name", { required: true, autoComplete: "name" })}
        {field("email", "Email", { type: "email", required: true, autoComplete: "email" })}
        {field("contactNumber", "Contact number", { type: "tel", autoComplete: "tel" })}
        {field("nmcNumber", "NMC number", { required: true })}
        {field("department", "Department")}
        {field("specialization", "Specialization")}
        <div className="sm:col-span-2">{field("qualification", "Qualification")}</div>
        {field("consultationFee", "Consultation fee (NPR)", { type: "number", min: 0, step: 1 })}
      </form>
      <p className="mt-4 rounded-2xl bg-lavender-pale px-4 py-3 text-xs font-medium text-ink-soft">
        The doctor must change the emailed temporary password on first sign-in. Leave the consultation fee blank to bill
        consultations manually.
      </p>
    </Modal>
  );
}

export default function Doctors() {
  const [doctors, setDoctors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [windows, setWindows] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [slotsDate, setSlotsDate] = useState(todayInputValue());
  const [slots, setSlots] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDoctors({ search: search.trim() || undefined, page, limit: 20 });
      setDoctors(data?.items || []);
      setPagination(data?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(getErrorMessage(err, "Could not load doctors."));
    } finally {
      setIsLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(loadDoctors, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadDoctors, search]);

  const selected = useMemo(
    () => doctors.find((doctor) => doctor._id === selectedId) || null,
    [doctors, selectedId]
  );

  /**
   * Selecting a doctor loads that doctor's real windows. `usingDefault` matters:
   * with no stored rows the booking path falls back to default clinic hours, so
   * the editor starts from those defaults instead of an empty week that looks
   * like "closed all week".
   */
  const selectDoctor = async (doctor) => {
    setSelectedId(doctor._id);
    setScheduleDirty(false);
    setScheduleLoading(true);
    try {
      const stored = await getDoctorAvailability(doctor._id);
      if (stored.length > 0) {
        setWindows(stored.map(toDraft));
      } else {
        setWindows([
          {
            key: "default-monday",
            weekday: 1,
            startTime: "09:00",
            endTime: "17:00",
            slotMinutes: DEFAULT_SLOT_MINUTES,
            isActive: true,
            isNew: true,
          },
        ]);
        toast.info("No published schedule yet. The default clinic hours are shown as a starting point.");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load this doctor's availability."));
      setWindows([]);
    } finally {
      setScheduleLoading(false);
    }
  };

  // Slot preview for the selected doctor, straight from the booking source of truth.
  useEffect(() => {
    if (!selectedId || !slotsDate) {
      setSlots(null);
      return undefined;
    }
    let cancelled = false;
    setSlotsLoading(true);
    getDoctorSlots(selectedId, { date: slotsDate })
      .then((result) => {
        if (!cancelled) setSlots(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots(null);
          toast.error(getErrorMessage(err, "Could not load slots."));
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, slotsDate]);

  const addWindow = (weekday) => {
    setWindows((current) => [...current, emptyWindow(weekday)]);
    setScheduleDirty(true);
  };

  const updateWindow = (next) => {
    setWindows((current) => current.map((item) => (item.key === next.key ? next : item)));
    setScheduleDirty(true);
  };

  const removeWindow = (target) => {
    setWindows((current) => current.filter((item) => item.key !== target.key));
    setScheduleDirty(true);
  };

  const saveSchedule = async () => {
    if (!selectedId) return;
    setSavingSchedule(true);
    try {
      // Only the fields the backend accepts are sent - `_id` and `isNew` are
      // client bookkeeping and must not reach the validator.
      const payload = windows.map((window) => ({
        weekday: window.weekday,
        startTime: window.startTime,
        endTime: window.endTime,
        slotMinutes: Number(window.slotMinutes),
        isActive: window.isActive !== false,
      }));
      await replaceDoctorAvailability(selectedId, payload);
      toast.success("Clinic hours published. Patients now see these slots when booking.");
      setScheduleDirty(false);
      await loadDoctors();
      const refreshed = await getDoctorAvailability(selectedId);
      setWindows(refreshed.map(toDraft));
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not publish these clinic hours."));
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Doctors &amp; Availability</h1>
          <p className="text-base font-medium text-ink-soft">
            Manage the doctor directory and the clinic hours patients book against.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-teal-mid px-4 text-sm font-semibold text-white transition hover:bg-teal-deep"
          >
            <Plus className="size-4" />
            Add doctor
          </button>
          <button
            type="button"
            onClick={loadDoctors}
            disabled={isLoading}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-deept/15 bg-white px-4 text-sm font-semibold text-teal-deep transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search doctors by name, email or NMC number"
          className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={5} columns={5} />
      ) : error ? (
        <ErrorState title="Could not load doctors" description={error} onRetry={loadDoctors} />
      ) : doctors.length === 0 ? (
        <p className="rounded-2xl border border-deept/10 bg-white px-6 py-10 text-center text-sm text-ink-soft">
          {search.trim() ? `No doctors match "${search.trim()}".` : "No doctor accounts exist yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* Directory */}
          <div className="flex flex-col gap-3">
            {doctors.map((doctor) => (
              <button
                key={doctor._id}
                type="button"
                onClick={() => selectDoctor(doctor)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selectedId === doctor._id
                    ? "border-teal-mid bg-softteal shadow-sm"
                    : "border-deept/10 bg-white hover:border-teal-mid/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-pale text-teal-mid">
                    <Stethoscope className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{doctor.name}</p>
                    <p className="truncate text-xs text-ink-soft">{doctor.department || "Department not set"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={doctor.status} />
                      {doctor.availability?.usingDefault ? (
                        <span className="rounded-full bg-softteal px-2 py-0.5 text-xs font-semibold text-ink-soft">
                          default hours
                        </span>
                      ) : (
                        <span className="rounded-full bg-lavender-pale px-2 py-0.5 text-xs font-semibold text-lavender">
                          {doctor.availability?.days?.length || 0} days published
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-ink-soft">
                      {doctor.stats?.appointments ?? 0} appointments · {doctor.stats?.upcoming ?? 0} upcoming
                      {doctor.consultationFee ? ` · Rs. ${formatMoney(doctor.consultationFee)}` : ""}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-xs text-ink-soft">
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total} doctors
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Availability editor */}
          <div className="flex flex-col gap-5">
            {!selected ? (
              <div className="rounded-2xl border border-deept/10 bg-white px-6 py-16 text-center">
                <CalendarClock className="mx-auto size-8 text-teal-mid" />
                <p className="mt-3 font-semibold text-teal-deep">Select a doctor</p>
                <p className="mt-1 text-sm text-ink-soft">Choose a doctor to publish or review their clinic hours.</p>
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-deept/10 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-heading text-xl font-bold text-teal-deep">{selected.name}</h2>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                        {selected.email && (
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="size-3.5" />
                            {selected.email}
                          </span>
                        )}
                        {(selected.phone || selected.contactNumber) && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="size-3.5" />
                            {selected.phone || selected.contactNumber}
                          </span>
                        )}
                        {selected.nmcNumber && (
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                            <BadgeCheck className="size-3.5" />
                            {selected.nmcNumber}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="inline-flex items-center gap-1.5 self-start rounded-full border border-teal/30 px-4 py-2 text-xs font-bold text-teal-mid transition hover:bg-teal-pale"
                    >
                      <Pencil className="size-3.5" />
                      Edit details
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-deept/10 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-deept/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-heading text-lg font-bold text-teal-deep">Published clinic hours</h2>
                      <p className="mt-1 text-sm text-ink-soft">
                        Saving publishes every change at once, and is rejected if it would strand a booked appointment.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={saveSchedule}
                      disabled={savingSchedule || !scheduleDirty}
                      className="inline-flex items-center gap-2 self-start rounded-full bg-teal-mid px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-deep disabled:opacity-50"
                    >
                      <Save className="size-4" />
                      {savingSchedule ? "Publishing…" : "Publish schedule"}
                    </button>
                  </div>

                  {scheduleLoading ? (
                    <LoadingSkeleton rows={4} columns={3} />
                  ) : (
                    <div className="divide-y divide-deept/5">
                      {WEEKDAYS.map((day) => {
                        const dayWindows = windows.filter((window) => window.weekday === day.value);
                        return (
                          <div key={day.value} className="px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="font-semibold text-deept">
                                {day.label}
                                {dayWindows.length === 0 && (
                                  <span className="ml-2 rounded-full bg-softteal px-2 py-0.5 text-xs font-semibold text-ink-soft">
                                    closed
                                  </span>
                                )}
                              </h3>
                              <button
                                type="button"
                                onClick={() => addWindow(day.value)}
                                className="inline-flex items-center gap-1 rounded-full border border-teal/30 px-3 py-1 text-xs font-bold text-teal-mid transition hover:bg-teal-pale"
                              >
                                <Plus className="size-3" />
                                Add window
                              </button>
                            </div>

                            {dayWindows.length > 0 && (
                              <div className="mt-3 flex flex-col gap-2">
                                {dayWindows.map((window) => (
                                  <WindowRow
                                    key={window.key}
                                    window={window}
                                    onChange={updateWindow}
                                    onRemove={removeWindow}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Day slots: exactly what a patient would be offered. */}
                <section className="rounded-2xl border border-deept/10 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-deept/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-heading text-lg font-bold text-teal-deep">Bookable slots</h2>
                      <p className="mt-1 text-sm text-ink-soft">What patients actually see when booking this doctor.</p>
                    </div>
                    <input
                      type="date"
                      value={slotsDate}
                      onChange={(e) => setSlotsDate(e.target.value)}
                      aria-label="Slot preview date"
                      className="h-10 self-start rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
                    />
                  </div>

                  <div className="px-5 py-4">
                    {slotsLoading ? (
                      <p className="text-sm text-ink-soft">Loading slots…</p>
                    ) : !slots ? (
                      <p className="text-sm text-ink-soft">Choose a date to preview availability.</p>
                    ) : slots.usingDefaultSchedule ? (
                      <p className="rounded-xl bg-softteal px-4 py-3 text-sm text-ink-soft">
                        This doctor has no published schedule, so the default clinic hours apply.
                      </p>
                    ) : (
                      <>
                        <p className="mb-3 text-sm text-ink-soft">
                          {slots.weekdayLabel} {formatDate(slots.date, "DD MMM YYYY")}
                          {slots.clinicHours
                            ? ` · ${formatTime12(slots.clinicHours.startTime)} to ${formatTime12(slots.clinicHours.endTime)}`
                            : " · closed"}
                        </p>
                        {slots.slots.length === 0 ? (
                          <p className="text-sm text-ink-soft">No slots on this day.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {slots.slots.map((slot) => (
                              <span
                                key={slot.startMinutes}
                                title={
                                  slot.booked
                                    ? `Booked as ${slot.bookedBy}`
                                    : slot.past
                                      ? "This time has passed"
                                      : "Available"
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                  slot.available
                                    ? "bg-teal-pale text-teal-mid"
                                    : slot.booked
                                      ? "bg-coral-pale text-coral-dark"
                                      : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {formatTime12(slot.startTime)}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}

      <EditDoctorModal open={editOpen} onClose={() => setEditOpen(false)} doctor={selected} onSaved={loadDoctors} />
      <AddDoctorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setSearch("");
          setPage(1);
          loadDoctors();
        }}
      />
    </div>
  );
}