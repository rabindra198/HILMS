import { useEffect, useMemo, useState } from "react";
import { Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  StatusBadge,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  formatDate,
  formatDateTime,
} from "../doctorUi";

/**
 * Consultation editor (FR-DR-02, FR-DR-08).
 *
 * Handles the three states of one consultation without three separate screens:
 * starting a visit from an appointment, saving notes while it is in progress, and
 * completing it.
 *
 * Two rules are enforced here as well as on the server, because getting them
 * wrong is silent otherwise:
 *  - a COMPLETED consultation cannot be edited without an amendment reason;
 *  - completing an encounter also closes the appointment it belongs to, so the
 *    day's list can never disagree with the chart.
 */

const emptyVitals = {
  bloodPressureSystolic: "",
  bloodPressureDiastolic: "",
  heartRate: "",
  temperature: "",
  respiratoryRate: "",
  spo2: "",
  weight: "",
  height: "",
  notes: "",
};

const emptyForm = {
  chiefComplaint: "",
  symptoms: "",
  diagnosis: "",
  treatmentPlan: "",
  clinicalNotes: "",
  treatmentOutcome: "",
  doctorNotes: "",
  vitals: emptyVitals,
  allowClinicalEdit: false,
  editReason: "",
};

const VITAL_FIELDS = [
  { key: "bloodPressureSystolic", label: "BP systolic", unit: "mmHg", step: "1", min: 40, max: 300 },
  { key: "bloodPressureDiastolic", label: "BP diastolic", unit: "mmHg", step: "1", min: 20, max: 200 },
  { key: "heartRate", label: "Heart rate", unit: "bpm", step: "1" },
  { key: "temperature", label: "Temperature", unit: "°C", step: "0.1" },
  { key: "respiratoryRate", label: "Resp. rate", unit: "/min", step: "1" },
  { key: "spo2", label: "SpO₂", unit: "%", step: "1" },
  { key: "weight", label: "Weight", unit: "kg", step: "0.1" },
  { key: "height", label: "Height", unit: "cm", step: "0.1" },
];

const LIMITS = {
  chiefComplaint: 300,
  diagnosis: 300,
  symptoms: 2000,
  clinicalNotes: 3000,
  treatmentPlan: 2000,
  treatmentOutcome: 1000,
  doctorNotes: 1000,
  vitalsNotes: 500,
};

/**
 * Builds the request body.
 *
 * Blank vitals are dropped rather than sent as empty strings: the validator is
 * `isFloat`, and `""` fails it, so sending every key unconditionally would make
 * an untouched vitals block block the save.
 */
const buildPayload = (form) => {
  const vitals = {};
  for (const { key } of VITAL_FIELDS) {
    const raw = String(form.vitals[key] ?? "").trim();
    if (raw !== "") vitals[key] = Number(raw);
  }
  const notes = String(form.vitals.notes || "").trim();
  if (notes) vitals.notes = notes;

  return {
    chiefComplaint: form.chiefComplaint.trim(),
    symptoms: form.symptoms.trim(),
    diagnosis: form.diagnosis.trim(),
    treatmentPlan: form.treatmentPlan.trim(),
    clinicalNotes: form.clinicalNotes.trim(),
    treatmentOutcome: form.treatmentOutcome.trim(),
    doctorNotes: form.doctorNotes.trim(),
    vitals,
  };
};

export function ConsultationEditor({ open, onClose, consultation, appointment, patient, onSaved }) {
  const isExisting = Boolean(consultation?._id);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("save");

  const status = String(consultation?.status || (isExisting ? "" : "IN_PROGRESS")).toUpperCase();
  // A completed chart is read-only until the doctor explicitly amends it, and
  // amending demands a reason - both recorded, both audited server-side.
  const [amending, setAmending] = useState(false);
  const readOnly = status === "COMPLETED" && !amending;

  useEffect(() => {
    if (!open) return;
    setAmending(false);
    setErrors({});
    setMode("save");
    if (consultation) {
      setForm({
        chiefComplaint: consultation.chiefComplaint || "",
        symptoms: consultation.symptoms || "",
        diagnosis: consultation.diagnosis || "",
        treatmentPlan: consultation.treatmentPlan || "",
        clinicalNotes: consultation.clinicalNotes || "",
        treatmentOutcome: consultation.treatmentOutcome || "",
        doctorNotes: consultation.doctorNotes || "",
        vitals: { ...emptyVitals, ...(consultation.vitals || {}) },
        allowClinicalEdit: false,
        editReason: "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, consultation]);

  const setField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const setVital = (key) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, vitals: { ...current.vitals, [key]: value } }));
    setErrors((current) => ({ ...current, vitals: undefined }));
  };

  /** Mirrors `validateCreateConsultation` / `validateCompleteConsultation`. */
  const validate = (intent) => {
    const next = {};
    const body = form;

    if (!body.chiefComplaint.trim()) next.chiefComplaint = "Please record the patient's chief complaint";
    else if (body.chiefComplaint.trim().length > LIMITS.chiefComplaint) {
      next.chiefComplaint = `Keep this to ${LIMITS.chiefComplaint} characters`;
    }

    // Completing requires a diagnosis; a draft may be saved without one.
    if (intent === "complete" && !body.diagnosis.trim()) next.diagnosis = "A diagnosis is required to complete this visit";

    for (const [field, limit] of [
      ["symptoms", LIMITS.symptoms],
      ["clinicalNotes", LIMITS.clinicalNotes],
      ["treatmentPlan", LIMITS.treatmentPlan],
      ["treatmentOutcome", LIMITS.treatmentOutcome],
      ["doctorNotes", LIMITS.doctorNotes],
    ]) {
      if (String(body[field] || "").trim().length > limit) next[field] = `Keep this to ${limit} characters`;
    }

    for (const { key, label } of VITAL_FIELDS) {
      const raw = String(body.vitals[key] ?? "").trim();
      if (raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) next.vitals = `${label} must be a number`;
      else if (key === "bloodPressureSystolic" && (value < 40 || value > 300)) {
        next.vitals = "Systolic pressure must be between 40 and 300 mmHg";
      } else if (key === "bloodPressureDiastolic" && (value < 20 || value > 200)) {
        next.vitals = "Diastolic pressure must be between 20 and 200 mmHg";
      } else if (key === "temperature" && (value < 25 || value > 45)) next.vitals = "Temperature must be between 25 and 45 °C";
      else if (key === "spo2" && (value < 50 || value > 100)) next.vitals = "SpO₂ must be between 50 and 100 %";
    }

    if (readOnly && String(form.editReason || "").trim().length < 10) {
      next.editReason = "Give at least 10 characters explaining the amendment";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const payload = useMemo(() => buildPayload(form), [form]);

  const save = async () => {
    if (saving || !validate("save")) return;
    setSaving(true);
    setMode("save");
    try {
      if (!isExisting) {
        const created = await doctorApi.createConsultation({
          ...payload,
          patient: patient?.id || patient?._id,
          ...(appointment?._id ? { appointment: appointment._id } : {}),
        });
        toast.success(`Consultation ${created.consultationNo} started`);
      } else {
        await doctorApi.updateConsultation(consultation._id, {
          ...payload,
          ...(readOnly ? { allowClinicalEdit: true, editReason: form.editReason.trim() } : {}),
        });
        toast.success("Consultation saved");
      }
      onSaved?.();
      onClose?.();
    } catch (saveError) {
      toast.error(getDoctorApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (saving || !validate("complete")) return;
    setSaving(true);
    setMode("complete");
    try {
      if (isExisting) {
        await doctorApi.completeConsultation(consultation._id, payload);
      } else {
        // A visit completed in one pass is created and closed together, so the
        // appointment is never left IN_CONSULTATION with no chart behind it.
        const created = await doctorApi.createConsultation({
          ...payload,
          patient: patient?.id || patient?._id,
          ...(appointment?._id ? { appointment: appointment._id } : {}),
        });
        await doctorApi.completeConsultation(created._id, payload);
      }
      toast.success("Consultation completed");
      onSaved?.();
      onClose?.();
    } catch (completeError) {
      toast.error(getDoctorApiError(completeError));
    } finally {
      setSaving(false);
    }
  };

  const canComplete = status !== "COMPLETED" && status !== "CANCELLED";

  const textarea = (field, label, limit, rows = 3, required = false) => (
    <div>
      <label htmlFor={`consultation-${field}`} className={LABEL_CLASS}>
        {label} {required && <span className="text-coral-dark">*</span>}
        <span className="ml-2 normal-case tracking-normal text-ink-soft">
          {String(form[field] || "").length}/{limit}
        </span>
      </label>
      <textarea
        id={`consultation-${field}`}
        rows={rows}
        maxLength={limit}
        value={form[field]}
        onChange={setField(field)}
        disabled={readOnly}
        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20 disabled:bg-deept/5 ${
          errors[field] ? "border-coral" : "border-deept/15 bg-white"
        }`}
      />
      {errors[field] && <p className="mt-1 text-xs font-bold text-coral-dark">{errors[field]}</p>}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={() => (saving ? undefined : onClose?.())}
      size="lg"
      title={isExisting ? `Consultation ${consultation.consultationNo || ""}` : "Start consultation"}
      description={
        appointment
          ? `For ${appointment.patient?.name || "the patient"} · ${formatDate(appointment.appointmentDate)}`
          : patient
            ? patient.name
            : undefined
      }
      closeDisabled={saving}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BUTTON}>
            Close
          </button>
          {!readOnly && (
            <button type="button" onClick={save} disabled={saving} className={SECONDARY_BUTTON}>
              <Save className="size-4" />
              {saving && mode === "save" ? "Saving..." : "Save draft"}
            </button>
          )}
          {canComplete && (
            <button type="button" onClick={complete} disabled={saving} className={PRIMARY_BUTTON}>
              <CheckCircle2 className="size-4" />
              {saving && mode === "complete" ? "Completing..." : "Complete visit"}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {consultation && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-teal-pale/60 px-4 py-3 text-xs">
            <StatusBadge status={consultation.status} />
            <span className="text-ink-soft">Started {formatDateTime(consultation.createdAt)}</span>
            {consultation.patient?.name && <span className="text-ink-soft">· {consultation.patient.name}</span>}
            {consultation.appointmentNo && <span className="font-mono text-ink-soft">· {consultation.appointmentNo}</span>}
          </div>
        )}

        {readOnly && (
          <div className="rounded-xl border-2 border-coral/30 bg-coral-pale px-4 py-3">
            <p className="text-sm font-bold text-coral-dark">This consultation is completed</p>
            <p className="mt-1 text-sm text-coral-dark">
              The record is locked. Amending it is recorded against your name with the reason below.
            </p>
            <button
              type="button"
              onClick={() => setAmending((current) => !current)}
              className={`${SECONDARY_BUTTON} mt-3`}
            >
              {amending ? "Keep it locked" : "Amend this consultation"}
            </button>
            {amending && (
              <div className="mt-3">
                <label htmlFor="consultation-edit-reason" className={LABEL_CLASS}>
                  Reason for amendment <span className="text-coral-dark">*</span>
                </label>
                <input
                  id="consultation-edit-reason"
                  value={form.editReason}
                  onChange={setField("editReason")}
                  placeholder="e.g. Corrected an allergy recorded from an earlier note"
                  className={`${FIELD_CLASS} ${errors.editReason ? "border-coral" : ""}`}
                />
                {errors.editReason && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.editReason}</p>}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {textarea("chiefComplaint", "Chief complaint", LIMITS.chiefComplaint, 2, true)}
          {textarea("diagnosis", "Diagnosis", LIMITS.diagnosis, 2, canComplete)}
        </div>

        {textarea("symptoms", "Symptoms and history", LIMITS.symptoms, 3)}

        <fieldset className="rounded-2xl border border-deept/12 p-4" disabled={readOnly}>
          <legend className="px-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
            Vitals <span className="normal-case tracking-normal">— leave blank if not taken</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {VITAL_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`vital-${field.key}`} className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  {field.label}
                </label>
                <div className="relative">
                  <input
                    id={`vital-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    placeholder={field.key === "bloodPressureSystolic" ? "e.g. 120" : undefined}
                    value={form.vitals[field.key]}
                    onChange={setVital(field.key)}
                    className={`${FIELD_CLASS} pr-14`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-soft">
                    {field.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {errors.vitals && <p className="mt-2 text-xs font-bold text-coral-dark">{errors.vitals}</p>}
          <div className="mt-3">
            <label htmlFor="vital-notes" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Vitals notes
            </label>
            <input
              id="vital-notes"
              value={form.vitals.notes}
              onChange={setVital("notes")}
              placeholder="e.g. Taken on the left arm, seated"
              className={FIELD_CLASS}
            />
          </div>
        </fieldset>

        {textarea("treatmentPlan", "Treatment plan", LIMITS.treatmentPlan, 3)}
        {textarea("clinicalNotes", "Clinical notes", LIMITS.clinicalNotes, 4)}
        {textarea("treatmentOutcome", "Treatment outcome", LIMITS.treatmentOutcome, 2)}

        {readOnly && (
          <p className="rounded-xl border border-deept/12 bg-deept/3 px-4 py-3 text-xs text-ink-soft">
            Private doctor notes are visible only to you and are never printed on a patient prescription.
          </p>
        )}
        {textarea("doctorNotes", "Private doctor notes", LIMITS.doctorNotes, 2)}
      </div>
    </Modal>
  );
}

export default ConsultationEditor;
