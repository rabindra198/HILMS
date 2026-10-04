import { useEffect, useState } from "react";
import { FlaskConical, Search } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import { LAB_PRIORITIES, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, humanise } from "../doctorUi";

/**
 * Laboratory ordering (FR-DR-05, FR-DR-06).
 *
 * Reuses the shared laboratory catalogue rather than a doctor-private copy: the
 * doctor orders from exactly the tests the Laboratory can actually run, so a test
 * that exists only in the doctor's dropdown cannot strand the request.
 */

export function LabOrderDialog({ open, onClose, patientId, appointmentId, consultationId, onSaved }) {
  const [tests, setTests] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ patient: "", test: "", priority: "ROUTINE", clinicalNotes: "" });
  const [errors, setErrors] = useState({});

  // The catalogue and the assignable patients are stable for a session, so they
  // are fetched once when the dialog first opens and reused afterwards.
  useEffect(() => {
    if (!open) return;
    setForm((current) => ({ ...current, patient: patientId || "", test: "", priority: "ROUTINE", clinicalNotes: "" }));
    setSearch("");
    setErrors({});
    if (tests.length && patients.length) return;

    setLoading(true);
    doctorApi
      .getLaboratoryWorkspace()
      .then((workspace) => {
        setTests(workspace?.tests || []);
        setPatients(workspace?.patients || []);
      })
      .catch((loadError) => toast.error(getDoctorApiError(loadError)))
      .finally(() => setLoading(false));
    // `tests`/`patients` are intentionally not dependencies: re-running on every
    // catalogue change would refetch and discard the doctor's in-progress search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId]);

  const patch = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const visible = tests.filter((test) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      String(test.name || test.testName || "").toLowerCase().includes(needle) ||
      String(test.category || "").toLowerCase().includes(needle)
    );
  });

  const submit = async () => {
    if (saving) return;
    const next = {};
    if (!form.patient) next.patient = "Choose a patient";
    if (!form.test) next.test = "Choose a test";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await doctorApi.createLabRequest({
        patient: form.patient,
        test: form.test,
        priority: form.priority,
        ...(appointmentId ? { appointment: appointmentId } : {}),
        // FR-DR-06 traceability: the consultation that prompted the order is stored
        // too, so the visit that caused the test is recoverable from either side.
        // The backend re-validates that it really belongs to this doctor and patient.
        ...(consultationId ? { consultation: consultationId } : {}),
        ...(form.clinicalNotes.trim() ? { clinicalNotes: form.clinicalNotes.trim() } : {}),
      });
      toast.success("Laboratory request sent");
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
      onClose={() => (saving ? undefined : onClose?.())}
      size="lg"
      title="Order a laboratory test"
      description="Sent to the Laboratory queue. You will be notified when the report is verified."
      closeDisabled={saving}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving || loading} className={PRIMARY_BUTTON}>
            <FlaskConical className="size-4" />
            {saving ? "Sending..." : "Send request"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lab-patient" className={LABEL_CLASS}>
              Patient <span className="text-coral-dark">*</span>
            </label>
            <select id="lab-patient" value={form.patient} onChange={patch("patient")} disabled={Boolean(patientId)} className={`${FIELD_CLASS} ${errors.patient ? "border-coral" : ""}`}>
              <option value="">Choose a patient...</option>
              {patients.map((patient) => (
                <option key={patient._id} value={patient._id}>
                  {patient.name}
                </option>
              ))}
            </select>
            {errors.patient && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.patient}</p>}
          </div>

          <div>
            <label htmlFor="lab-priority" className={LABEL_CLASS}>
              Priority
            </label>
            <select id="lab-priority" value={form.priority} onChange={patch("priority")} className={FIELD_CLASS}>
              {LAB_PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {humanise(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="lab-test-search" className={LABEL_CLASS}>
            Test <span className="text-coral-dark">*</span>
          </label>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="lab-test-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter the laboratory catalogue..."
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>
          {loading ? (
            <p className="py-6 text-center text-sm text-ink-soft">Loading the laboratory catalogue...</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {visible.map((test) => (
                <label
                  key={test._id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                    form.test === test._id ? "border-teal-mid bg-teal-pale" : "border-deept/12 hover:bg-teal-pale/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="lab-test"
                    value={test._id}
                    checked={form.test === test._id}
                    onChange={patch("test")}
                    className="mt-1 accent-teal-mid"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink">{test.name || test.testName}</span>
                    <span className="block text-xs text-ink-soft">
                      {test.category}
                      {test.sampleType ? ` · ${test.sampleType}` : ""}
                      {test.price ? ` · NPR ${test.price}` : ""}
                    </span>
                  </span>
                </label>
              ))}
              {!visible.length && <p className="py-6 text-center text-sm text-ink-soft">No active test matches that filter.</p>}
            </div>
          )}
          {errors.test && <p className="mt-1 text-xs font-bold text-coral-dark">{errors.test}</p>}
        </div>

        <div>
          <label htmlFor="lab-notes" className={LABEL_CLASS}>
            Clinical notes for the laboratory
          </label>
          <textarea
            id="lab-notes"
            rows={2}
            maxLength={1000}
            value={form.clinicalNotes}
            onChange={patch("clinicalNotes")}
            placeholder="e.g. Fasting sample required, collected before 10:00"
            className="w-full rounded-xl border border-deept/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
          />
        </div>
      </div>
    </Modal>
  );
}

export default LabOrderDialog;
