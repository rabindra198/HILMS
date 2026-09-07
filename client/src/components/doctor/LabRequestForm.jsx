import { useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/doctor/Modal";
import { doctorApi } from "@/services/doctorApi";

const DEFAULT_TESTS = [
  "CBC",
  "Blood Sugar",
  "Urine",
  "Stool",
  "Liver Function",
  "Kidney Function",
  "Lipid Profile",
  "Thyroid Profile",
  "ECG",
  "X-Ray",
  "CT Scan",
  "MRI",
  "Ultrasound",
];

function LabRequestForm({ patient, appointmentId }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [testName, setTestName] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [clinicalNotes, setClinicalNotes] = useState("");

  const filtered = DEFAULT_TESTS.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!testName) {
      toast.error("Please select a test");
      return;
    }
    setSaving(true);
    try {
      await doctorApi.requestLabTest({
        patient: patient?.id,
        appointment: appointmentId,
        testName,
        priority,
        clinicalNotes,
      });
      toast.success("Laboratory test requested successfully");
      setOpen(false);
      setTestName("");
      setClinicalNotes("");
    } catch (e) {
      toast.error("Unable to request test. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FlaskConical className="size-4" /> Request Lab Test
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request Laboratory Test"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              <Plus className="size-4" /> {saving ? "Requesting..." : "Request Test"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Patient</label>
            <Input value={patient?.name || ""} readOnly />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Test</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search test..."
              className="mb-2 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-deept/10 p-2 sm:grid-cols-3">
              {filtered.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTestName(t)}
                  className={`rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                    testName === t
                      ? "bg-teal-mid text-white"
                      : "bg-cream text-ink hover:bg-teal-pale"
                  }`}
                >
                  {t}
                </button>
              ))}
              {filtered.length === 0 && (
                <span className="col-span-full p-2 text-center text-xs text-ink-soft">
                  No tests match your search.
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {["Normal", "Urgent", "Emergency"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    priority === p
                      ? p === "Emergency"
                        ? "border-coral bg-coral-pale text-coral-dark"
                        : p === "Urgent"
                        ? "border-sand bg-sand text-coral-dark"
                        : "border-teal-mid bg-teal-pale text-teal-mid"
                      : "border-deept/10 bg-white text-ink-soft"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Clinical Notes</label>
            <textarea
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Reason for the test, clinical context..."
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

export { LabRequestForm };
