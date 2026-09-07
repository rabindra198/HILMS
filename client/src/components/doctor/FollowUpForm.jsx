import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/doctor/Modal";
import { doctorApi } from "@/services/doctorApi";

function FollowUpForm({ patient, consultationId, buttonLabel = "Schedule Follow-Up" }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    if (!date) {
      toast.error("Please select a follow-up date");
      return;
    }
    setSaving(true);
    try {
      await doctorApi.createFollowUp({
        patient: patient?.id,
        consultation: consultationId,
        date,
        time,
        reason,
        notes,
      });
      toast.success("Follow-up scheduled successfully");
      setOpen(false);
      setDate("");
      setTime("");
      setReason("");
      setNotes("");
    } catch (e) {
      toast.error("Unable to schedule follow-up. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" /> {buttonLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule Follow-Up"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Scheduling..." : "Schedule Follow-up"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Patient</label>
            <Input value={patient?.name || ""} readOnly />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Follow-Up Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Time</label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for follow-up" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Additional notes"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

export { FollowUpForm };
