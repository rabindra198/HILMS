import { useState, useRef } from "react";
import { Plus, Trash2, Printer, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/doctor/Modal";
import { doctorApi } from "@/services/doctorApi";

const emptyMedicine = { name: "", dosage: "", frequency: "", duration: "", instructions: "" };

function PrescriptionForm({ patient, defaultDiagnosis, onSaved, consultationId, doctorName, licenseNumber }) {
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const printContainerRef = useRef(null);
  const [diagnosis, setDiagnosis] = useState(defaultDiagnosis || "");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [medicines, setMedicines] = useState([{ ...emptyMedicine }]);

  const updateMedicine = (index, field, value) => {
    setMedicines((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const addMedicine = () => setMedicines((prev) => [...prev, { ...emptyMedicine }]);
  const removeMedicine = (index) => setMedicines((prev) => prev.filter((_, i) => i !== index));

  const validate = () => {
    if (!diagnosis.trim()) {
      toast.error("Please enter a diagnosis");
      return false;
    }
    for (const m of medicines) {
      if (!m.name.trim() || !m.dosage.trim() || !m.frequency.trim() || !m.duration.trim()) {
        toast.error("Each medicine requires a name, dosage, frequency and duration");
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        patient: patient?.id,
        consultation: consultationId,
        diagnosis,
        medicines: medicines.filter((m) => m.name.trim()),
        notes,
        followUpDate,
      };
      await doctorApi.createPrescription(payload);
      toast.success("Prescription created successfully");
      setOpen(false);
      if (onSaved) onSaved();
    } catch {
      toast.error("Unable to save prescription. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const license = licenseNumber || "";

  const printView = (
    <div className="font-sans text-ink">
      <div className="flex items-start justify-between border-b-2 border-ink/20 pb-4">
        <div>
          <p className="font-heading text-2xl font-extrabold text-teal-deep">HILMS</p>
          <p className="text-xs text-ink-soft">Hospital Information & Laboratory Management System</p>
        </div>
        <p className="text-3xl font-bold text-teal-deep/20 font-heading">Prescription</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-bold text-ink">Doctor</p>
          <p className="mt-1">{doctorName}</p>
          {license && <p>License: {license}</p>}
        </div>
        <div>
          <p className="font-bold text-ink">Patient</p>
          <p className="mt-1">{patient?.name}</p>
          <p>Age: {patient?.age} | Gender: {patient?.gender}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="font-bold text-ink">Diagnosis</p>
        <p className="mt-1 text-sm">{diagnosis || "—"}</p>
      </div>

      <div className="mt-6">
        <p className="font-bold text-ink">Medicines</p>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left">
              <th className="py-1.5 pr-2 font-semibold">Medicine</th>
              <th className="py-1.5 pr-2 font-semibold">Dosage</th>
              <th className="py-1.5 pr-2 font-semibold">Frequency</th>
              <th className="py-1.5 pr-2 font-semibold">Duration</th>
              <th className="py-1.5 font-semibold">Instructions</th>
            </tr>
          </thead>
          <tbody>
            {medicines.filter((m) => m.name.trim()).map((m, i) => (
              <tr key={i} className="border-b border-ink/10">
                <td className="py-2 pr-2">{m.name}</td>
                <td className="py-2 pr-2">{m.dosage}</td>
                <td className="py-2 pr-2">{m.frequency}</td>
                <td className="py-2 pr-2">{m.duration}</td>
                <td className="py-2">{m.instructions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(notes || followUpDate) && (
        <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
          {notes && (
            <div>
              <p className="font-bold text-ink">Doctor's Notes</p>
              <p className="mt-1">{notes}</p>
            </div>
          )}
          {followUpDate && (
            <div>
              <p className="font-bold text-ink">Follow-up Date</p>
              <p className="mt-1">{followUpDate}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-10 flex justify-end">
        <div className="text-center">
          <p className="font-heading text-lg italic text-ink">{doctorName}</p>
          <p className="text-xs text-ink-soft mt-1 border-t border-ink/20 pt-1">Doctor Signature</p>
        </div>
      </div>
    </div>
  );

  const handlePrint = () => {
    const container = document.createElement("div");
    container.innerHTML = printContainerRef.current?.innerHTML || "";
    const printWindow = window.open("", "_blank", "width=900,height=700");
    printWindow.document.write(`<html><head><title>Prescription</title><style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #1a202c; }
      h1 { color: #0f766e; margin: 0; }
      table { width: 100%; border-collapse: collapse; }
      td, th { padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
      .sig { text-align: right; margin-top: 48px; }
    </style></head><body>${container.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
    toast.success("Print dialog opened for prescription");
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Prescription
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={reviewing ? "Prescription Preview" : "Create Prescription"}
        size="lg"
        footer={
          reviewing ? (
            <>
              <Button variant="outline" onClick={() => setReviewing(false)}>Back</Button>
                <Button
                  onClick={async () => {
                    handlePrint();
                    setReviewing(false);
                    setOpen(false);
                    if (onSaved) onSaved();
                  }}
                >
                <Printer className="size-4" /> Print / Download PDF
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="outline" onClick={() => setReviewing(true)}>
                <Eye className="size-4" /> Preview
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Download className="size-4" /> {saving ? "Saving..." : "Save Prescription"}
              </Button>
            </>
          )
        }
      >
        {reviewing ? (
          <div ref={printContainerRef} className="rounded-xl border border-deept/10 p-6">{printView}</div>
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Patient</label>
              <Input value={patient?.name || ""} readOnly />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Diagnosis</label>
              <textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Enter diagnosis"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-ink">Medicines</label>
                <Button type="button" variant="outline" size="sm" onClick={addMedicine}>
                  <Plus className="size-3.5" /> Add Medicine
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {medicines.map((m, index) => (
                  <div key={index} className="rounded-xl border border-deept/10 bg-cream/40 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="mb-0.5 block text-xs text-ink-soft">Medicine</label>
                        <Input value={m.name} onChange={(e) => updateMedicine(index, "name", e.target.value)} placeholder="Paracetamol" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-ink-soft">Dosage</label>
                        <Input value={m.dosage} onChange={(e) => updateMedicine(index, "dosage", e.target.value)} placeholder="500 mg" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-ink-soft">Frequency</label>
                        <Input value={m.frequency} onChange={(e) => updateMedicine(index, "frequency", e.target.value)} placeholder="3 times daily" />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs text-ink-soft">Duration</label>
                        <Input value={m.duration} onChange={(e) => updateMedicine(index, "duration", e.target.value)} placeholder="5 days" />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="mb-0.5 block text-xs text-ink-soft">Instructions</label>
                        <Input value={m.instructions} onChange={(e) => updateMedicine(index, "instructions", e.target.value)} placeholder="After meals" />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => removeMedicine(index)} className="inline-flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline">
                        <Trash2 className="size-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Doctor's Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  placeholder="Additional notes"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Follow-up Date</label>
                <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export { PrescriptionForm };
