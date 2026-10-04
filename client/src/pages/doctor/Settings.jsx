import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCw, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import ActiveSessions from "@/components/common/ActiveSessions";
import { DoctorPageShell, DoctorCard, DoctorTrustNote, PRIMARY_BUTTON, SECONDARY_BUTTON, CHIP_BUTTON } from "./doctorUi";

/**
 * Notification settings (SRS 8.4).
 *
 * Mirrors the four boolean columns on `DoctorSettings`. Each toggle saves on
 * click rather than behind one "Save" button, because these are independent
 * switches and a doctor switching off email should not have to remember to
 * press save - a setting that appears to work but is never persisted is worse
 * than no setting at all.
 */

const TOGGLES = [
  { field: "appointmentAlerts", label: "Appointment reminders", hint: "Bookings, cancellations and no-shows for your clinic list." },
  { field: "followUpAlerts", label: "Follow-up reminders", hint: "Patients you asked to come back, as their date approaches." },
  { field: "labReportAlerts", label: "Laboratory report alerts", hint: "When a report you ordered is verified by the laboratory." },
  { field: "emailNotifications", label: "Email delivery", hint: "Also send these alerts to your registered email address." },
];

export default function DoctorSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyField, setBusyField] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSettings(await doctorApi.getSettings());
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (entry) => {
    if (busyField) return;
    const next = !settings?.[entry.field];
    setBusyField(entry.field);
    // Optimistic: flip immediately so the switch feels responsive, then re-read
    // the server's copy. A rejected save is reverted by the reload, so the UI
    // can never keep showing a preference the backend refused.
    setSettings((current) => ({ ...current, [entry.field]: next }));
    try {
      await doctorApi.updateSettings({ [entry.field]: next });
      toast.success(`${entry.label} ${next ? "on" : "off"}`);
      await load();
    } catch (toggleError) {
      toast.error(getDoctorApiError(toggleError));
      await load();
    } finally {
      setBusyField(null);
    }
  };

  if (loading) {
    return (
      <DoctorPageShell title="Settings" description="Loading your preferences...">
        <div className="h-64 animate-pulse rounded-2xl border-2 border-deept/10 bg-white" />
      </DoctorPageShell>
    );
  }

  if (error) {
    return (
      <DoctorPageShell title="Settings">
        <DoctorCard>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-heading text-lg font-bold text-coral-dark">Unable to load your settings</p>
            <p className="max-w-sm text-sm text-ink-soft">{error}</p>
            <button type="button" onClick={load} className={SECONDARY_BUTTON}>
              <RefreshCw className="size-4" /> Try again
            </button>
          </div>
        </DoctorCard>
      </DoctorPageShell>
    );
  }

  return (
    <DoctorPageShell
      title="Settings"
      description="How HILMS notifies you. Changes save immediately."
      actions={
        <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <DoctorCard
        title="Notifications"
        description="These apply to your Doctor account only."
      >
        <ul className="space-y-3">
          {TOGGLES.map((entry) => {
            const enabled = Boolean(settings?.[entry.field]);
            return (
              <li key={entry.field} className="flex items-start justify-between gap-4 rounded-2xl border border-deept/12 px-4 py-4">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{entry.label}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{entry.hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={entry.label}
                  disabled={busyField === entry.field}
                  onClick={() => toggle(entry)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
                    enabled ? "bg-teal-mid" : "bg-deept/20"
                  }`}
                >
                  <span
                    className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${
                      enabled ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 flex items-start gap-2 rounded-xl bg-teal-pale/60 px-4 py-3 text-xs text-ink-soft">
          <Bell className="mt-0.5 size-4 shrink-0 text-teal-mid" />
          Turning an alert off here does not stop a notification you are already required to acknowledge, such as a STAT
          laboratory result. Those always reach you.
        </p>
      </DoctorCard>

      <DoctorCard title="Clinic availability">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Settings2 className="size-10 text-deept/20" />
          <p className="font-heading text-lg font-bold text-teal-deep">Not yet configurable</p>
          <p className="max-w-md text-sm text-ink-soft">
            Working hours and slot availability are managed by Super Admin and enforced when appointments are booked,
            so a doctor cannot open a slot the Front Desk has not staffed. Use the Schedule and Working Hours screens to
            see the availability that applies to you.
          </p>
        </div>
      </DoctorCard>

      <div className="flex justify-end">
        <button type="button" onClick={load} className={PRIMARY_BUTTON}>
          <Save className="size-4" /> Save and close
        </button>
      </div>

      <ActiveSessions />

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
