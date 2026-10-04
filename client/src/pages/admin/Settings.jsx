import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Info, RotateCcw, Save } from "lucide-react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import ActiveSessions from "@/components/common/ActiveSessions";
import { getMySettings, updateMySettings } from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";

/**
 * Administrator notification preferences.
 *
 * The toggle list below is not a UI invention - `updateMySettings` accepts only
 * these six fields and silently ignores anything else, so the screen mirrors the
 * backend's `ALLOWED` set exactly:
 *
 *   accessRequestAlerts, appointmentAlerts, patientAlerts,
 *   laboratoryAlerts, billingAlerts, emailNotifications
 *
 * Edits are staged locally and saved as one PATCH so a half-toggled form is
 * never persisted. `dirty` drives the Save button; there is no autosave,
 * because an unnoticed silent write of notification settings is harder to reason
 * about than an explicit one.
 */

/** Mirrors `ALLOWED` in `adminPatientService.updateMySettings`. */
const PREFERENCES = [
  { field: "accessRequestAlerts", label: "Access requests", description: "Doctor and laboratory registration requests awaiting your review." },
  { field: "appointmentAlerts", label: "Appointments", description: "New bookings, cancellations and status changes." },
  { field: "patientAlerts", label: "Patients", description: "Patient registrations and record changes." },
  { field: "laboratoryAlerts", label: "Laboratory", description: "Laboratory activity that may need administrative attention." },
  { field: "billingAlerts", label: "Billing", description: "Invoices raised, payments settled and balances outstanding." },
  { field: "emailNotifications", label: "Email delivery", description: "Also send these alerts to your registered email address." },
];

const defaultsFrom = (settings) =>
  PREFERENCES.reduce(
    (accumulator, preference) => ({ ...accumulator, [preference.field]: Boolean(settings?.[preference.field]) }),
    {}
  );

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getMySettings();
      setSettings(result);
      setDraft(defaultsFrom(result));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load your notification settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = PREFERENCES.some((preference) => draft[preference.field] !== Boolean(settings?.[preference.field]));

  const toggle = (field) => setDraft((current) => ({ ...current, [field]: !current[field] }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateMySettings(draft);
      setSettings(updated);
      setDraft(defaultsFrom(updated));
      toast.success("Notification preferences saved.");
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "Unable to save your preferences."));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setDraft(defaultsFrom(settings));

  if (loading) return <LoadingSkeleton rows={6} columns={1} />;
  if (error) return <ErrorState title="Could not load your settings" description={error} onRetry={load} />;

  const enabledCount = PREFERENCES.filter((preference) => draft[preference.field]).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Settings</h1>
        <p className="text-base font-medium text-ink-soft">
          Choose which administrative alerts reach your inbox. {enabledCount} of {PREFERENCES.length} categories are on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-lavender-pale">
                <Bell className="size-5 text-lavender" />
              </div>
              <h2 className="font-heading text-xl font-bold text-teal-deep">Notification preferences</h2>
            </div>

            <div className="flex flex-col divide-y divide-deept/5">
              {PREFERENCES.map((preference) => {
                const enabled = Boolean(draft[preference.field]);
                return (
                  <label key={preference.field} className="flex cursor-pointer items-start justify-between gap-4 py-3.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{preference.label}</span>
                      <span className="mt-0.5 block text-xs text-ink-soft">{preference.description}</span>
                    </span>
                    <span className="relative mt-0.5 inline-flex shrink-0 items-center">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggle(preference.field)}
                        className="peer sr-only"
                      />
                      <span
                        className={`block h-6 w-11 rounded-full transition-colors ${
                          enabled ? "bg-teal-mid" : "bg-deept/20"
                        } peer-focus-visible:ring-2 peer-focus-visible:ring-teal-mid peer-focus-visible:ring-offset-2`}
                      />
                      <span
                        className={`pointer-events-none absolute left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                          enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 rounded-full bg-teal-mid px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-mid/30 transition hover:-translate-y-0.5 hover:bg-teal-deep disabled:opacity-50"
              >
                {dirty ? <Save className="size-4" /> : <Check className="size-4" />}
                {saving ? "Saving..." : dirty ? "Save preferences" : "Saved"}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={!dirty}
                className="inline-flex items-center gap-2 rounded-full border border-deept/15 bg-white px-5 py-2.5 text-sm font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-50"
              >
                <RotateCcw className="size-4" />
                Discard changes
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-heading text-lg font-bold text-teal-deep">About these settings</h2>
            <div className="flex items-start gap-2 text-sm text-ink-soft">
              <Info className="mt-0.5 size-4 shrink-0 text-teal-mid" />
              <p>
                Preferences are stored on your own administrator settings record and apply wherever you sign in.
                Turning a category off stops new alerts from being created - it does not remove notifications you
                have already received.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-heading text-lg font-bold text-teal-deep">Your account</h2>
            <p className="text-sm text-ink-soft">
              Name, email and password are managed on the Profile page. Role and account status are controlled by
              another administrator.
            </p>
          </div>
        </div>
      </div>

      <ActiveSessions />
    </div>
  );
}