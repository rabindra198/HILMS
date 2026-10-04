import { useEffect, useState } from "react";
import { BellRing, LockKeyhole, Save } from "lucide-react";
import { toast } from "sonner";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import ActiveSessions from "@/components/common/ActiveSessions";
import { LabCard, LabPageShell, LabTrustNote } from "./LabPageShell";

const DEFAULT_SETTINGS = {
  urgentRequestAlerts: true,
  processingAlerts: true,
  reportVerificationAlerts: true,
  emailNotifications: false,
};

const ALERTS = [
  ["urgentRequestAlerts", "Urgent request alerts", "Be notified when a high-priority test arrives."],
  ["processingAlerts", "Processing alerts", "Know when a batch is ready for review."],
  ["reportVerificationAlerts", "Report verification alerts", "Know when a report is awaiting verification."],
];

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    laboratoryApi
      .getSettings()
      .then((data) => setSettings({ ...DEFAULT_SETTINGS, ...data }))
      .catch((error) => toast.error(getApiError(error)))
      .finally(() => setLoading(false));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await laboratoryApi.updateSettings(settings);
      setSettings({ ...DEFAULT_SETTINGS, ...updated });
      toast.success("Settings updated");
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LabPageShell title="Settings" description="Configure laboratory alerts and workspace preferences.">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <LabCard title="Workflow alerts" description={loading ? "Loading preferences..." : "Changes are saved to your laboratory account."}>
          <form onSubmit={save} className="space-y-3">
            {ALERTS.map(([key, title, text]) => (
              <label key={key} className="flex cursor-pointer items-center gap-4 rounded-xl border border-deept/10 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-pale text-teal-mid">
                  <BellRing className="size-5" />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="block text-xs text-ink-soft">{text}</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(settings[key])}
                  onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))}
                />
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-deept/10 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lavender-pale text-lavender">
                <BellRing className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-ink">Email notifications</span>
                <span className="block text-xs text-ink-soft">Also send report-ready email when a report is verified.</span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(settings.emailNotifications)}
                onChange={(event) => setSettings((current) => ({ ...current, emailNotifications: event.target.checked }))}
              />
            </label>
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
              >
                <Save className="size-4" />
                {saving ? "Saving..." : "Save preferences"}
              </button>
            </div>
          </form>
        </LabCard>

        <LabCard title="Access and security">
          <ul className="space-y-3 text-sm text-ink-soft">
            <li className="flex gap-3 rounded-xl border border-deept/10 p-4">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-teal-mid" />
              <span>
                Your account role determines what you can do. Sample, result and report actions are recorded in the audit
                log with your user identity.
              </span>
            </li>
            <li className="flex gap-3 rounded-xl border border-deept/10 p-4">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-teal-mid" />
              <span>
                A verified report is a released clinical document. Its results cannot be edited afterwards.
              </span>
            </li>
            <li className="flex gap-3 rounded-xl border border-deept/10 p-4">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-teal-mid" />
              <span>Change your password from the Profile page.</span>
            </li>
          </ul>
        </LabCard>
      </div>

      <ActiveSessions />

      <LabTrustNote />
    </LabPageShell>
  );
}
