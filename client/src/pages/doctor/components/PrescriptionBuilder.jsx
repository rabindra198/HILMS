import { useState } from "react";
import { Pill, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  FREQUENCIES,
  ROUTES,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  humanise,
} from "../doctorUi";

/**
 * Prescription builder (FR-DR-03).
 *
 * Medicines are entered as rows rather than a fixed set of inputs, because
 * prescriptions are not one-medicine-per-row in practice - and a fixed layout
 * silently truncates a five-drug regimen.
 */

const emptyItem = { medicine: "", dosage: "", frequency: "ONCE_DAILY", route: "ORAL", duration: "", quantity: "", instructions: "" };

export function PrescriptionBuilder({ open, onClose, patientId, consultationId, onSaved }) {
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setItems([{ ...emptyItem }]);
    setNotes("");
    setFollowUpDate("");
    setErrors({});
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose?.();
  };

  const patchItem = (index, field, value) => {
    setItems((current) => current.map((item, position) => (position === index ? { ...item, [field]: value } : item)));
    setErrors((current) => ({ ...current, items: undefined, [field]: undefined }));
  };

  const addItem = () => setItems((current) => [...current, { ...emptyItem }]);

  const removeItem = (index) =>
    setItems((current) => (current.length === 1 ? current : current.filter((_, position) => position !== index)));

  /** Mirrors `validateCreatePrescription`: 1-20 rows, each with three required fields. */
  const validate = () => {
    const next = {};
    if (items.length < 1 || items.length > 20) next.items = "Add between 1 and 20 medicines";
    items.forEach((item, index) => {
      if (!item.medicine.trim()) next[`${index}-medicine`] = "Required";
      if (!item.dosage.trim()) next[`${index}-dosage`] = "Required";
      if (!item.duration.trim()) next[`${index}-duration`] = "Required";
    });
    if (String(notes).trim().length > 1000) next.notes = "Keep this to 1000 characters";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const created = await doctorApi.createPrescription({
        patient: patientId,
        ...(consultationId ? { consultation: consultationId } : {}),
        notes: notes.trim() || undefined,
        // A follow-up date on the prescription is what the Front Desk and the
        // doctor both use to book the return visit.
        ...(followUpDate ? { followUpDate: new Date(`${followUpDate}T09:00:00`).toISOString() } : {}),
        items: items.map((item) => ({
          medicine: item.medicine.trim(),
          dosage: item.dosage.trim(),
          frequency: item.frequency,
          route: item.route,
          duration: item.duration.trim(),
          ...(item.quantity ? { quantity: Number(item.quantity) } : {}),
          ...(item.instructions.trim() ? { instructions: item.instructions.trim() } : {}),
        })),
      });
      toast.success(`Prescription ${created.prescriptionNo} issued`);
      reset();
      onSaved?.();
      onClose?.();
    } catch (saveError) {
      toast.error(getDoctorApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="New prescription"
      description="Issued against this visit and printable as a patient document."
      closeDisabled={saving}
      footer={
        <>
          <button type="button" onClick={close} disabled={saving} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" onClick={addItem} disabled={saving} className={SECONDARY_BUTTON}>
            <Plus className="size-4" /> Add medicine
          </button>
          <button type="button" onClick={submit} disabled={saving} className={PRIMARY_BUTTON}>
            <Pill className="size-4" />
            {saving ? "Issuing..." : "Issue prescription"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.items && <p className="rounded-xl border border-coral/30 bg-coral-pale px-3 py-2 text-sm font-bold text-coral-dark">{errors.items}</p>}

        {items.map((item, index) => (
          <div key={index} className="rounded-2xl border border-deept/12 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Medicine {index + 1}</p>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-coral-dark"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={`rx-${index}-medicine`} className={LABEL_CLASS}>
                  Medicine <span className="text-coral-dark">*</span>
                </label>
                <input
                  id={`rx-${index}-medicine`}
                  value={item.medicine}
                  onChange={(event) => patchItem(index, "medicine", event.target.value)}
                  placeholder="e.g. Amoxicillin"
                  className={`${FIELD_CLASS} ${errors[`${index}-medicine`] ? "border-coral" : ""}`}
                />
                {errors[`${index}-medicine`] && <p className="mt-1 text-xs font-bold text-coral-dark">{errors[`${index}-medicine`]}</p>}
              </div>

              <div>
                <label htmlFor={`rx-${index}-dosage`} className={LABEL_CLASS}>
                  Dosage <span className="text-coral-dark">*</span>
                </label>
                <input
                  id={`rx-${index}-dosage`}
                  value={item.dosage}
                  onChange={(event) => patchItem(index, "dosage", event.target.value)}
                  placeholder="e.g. 500 mg"
                  className={`${FIELD_CLASS} ${errors[`${index}-dosage`] ? "border-coral" : ""}`}
                />
                {errors[`${index}-dosage`] && <p className="mt-1 text-xs font-bold text-coral-dark">{errors[`${index}-dosage`]}</p>}
              </div>

              <div>
                <label htmlFor={`rx-${index}-duration`} className={LABEL_CLASS}>
                  Duration <span className="text-coral-dark">*</span>
                </label>
                <input
                  id={`rx-${index}-duration`}
                  value={item.duration}
                  onChange={(event) => patchItem(index, "duration", event.target.value)}
                  placeholder="e.g. 5 days"
                  className={`${FIELD_CLASS} ${errors[`${index}-duration`] ? "border-coral" : ""}`}
                />
                {errors[`${index}-duration`] && <p className="mt-1 text-xs font-bold text-coral-dark">{errors[`${index}-duration`]}</p>}
              </div>

              <div>
                <label htmlFor={`rx-${index}-frequency`} className={LABEL_CLASS}>
                  Frequency
                </label>
                <select id={`rx-${index}-frequency`} value={item.frequency} onChange={(event) => patchItem(index, "frequency", event.target.value)} className={FIELD_CLASS}>
                  {FREQUENCIES.map((option) => (
                    <option key={option} value={option}>
                      {humanise(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`rx-${index}-route`} className={LABEL_CLASS}>
                  Route
                </label>
                <select id={`rx-${index}-route`} value={item.route} onChange={(event) => patchItem(index, "route", event.target.value)} className={FIELD_CLASS}>
                  {ROUTES.map((option) => (
                    <option key={option} value={option}>
                      {humanise(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`rx-${index}-quantity`} className={LABEL_CLASS}>
                  Quantity
                </label>
                <input
                  id={`rx-${index}-quantity`}
                  type="number"
                  min="0"
                  step="1"
                  value={item.quantity}
                  onChange={(event) => patchItem(index, "quantity", event.target.value)}
                  placeholder="Optional"
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <label htmlFor={`rx-${index}-instructions`} className={LABEL_CLASS}>
                  Instructions
                </label>
                <input
                  id={`rx-${index}-instructions`}
                  maxLength={500}
                  value={item.instructions}
                  onChange={(event) => patchItem(index, "instructions", event.target.value)}
                  placeholder="e.g. Take after food"
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rx-notes" className={LABEL_CLASS}>
              Advice to patient
            </label>
            <textarea
              id="rx-notes"
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Printed at the bottom of the prescription..."
              className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-teal-mid ${errors.notes ? "border-coral" : "border-deept/15 bg-white"}`}
            />
            {errors.notes && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.notes}</p>}
          </div>
          <div>
            <label htmlFor="rx-followup" className={LABEL_CLASS}>
              Review after
            </label>
            <input id="rx-followup" type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} className={FIELD_CLASS} />
            <p className="mt-1 text-xs text-ink-soft">Booked as a follow-up on the Appointments screen.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default PrescriptionBuilder;
