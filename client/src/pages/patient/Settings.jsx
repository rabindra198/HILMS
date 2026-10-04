import { useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import ActiveSessions from "@/components/common/ActiveSessions";
import { PatientCard, PatientPageShell, FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON, humanise } from "./patientUi";

/**
 * Account settings.
 *
 * Only settings that are genuinely persisted are offered.
 *
 * The previous version of this screen held notification preferences in
 * `localStorage` behind checkboxes, so a toggle looked saved but was per-browser:
 * clearing site data silently reset it, and logging in on a phone lost it. Nothing
 * in HILMS stores patient notification preferences, so those switches are gone
 * rather than left as decoration.
 *
 * Password change is real - it goes through `PATCH /auth/change-password`, the same
 * endpoint the forced first-login screen uses, so the credential is verified and
 * stored server-side.
 */
export default function PatientSettings() {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);

  const change = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();

    // Checked here to avoid a pointless round trip; the server enforces both rules
    // again on its own.
    if (form.newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error("The two passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      });
      toast.success("Password changed.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not change your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PatientPageShell title="Settings" description="Your account and how you sign in.">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <PatientCard title="Account" description="Read-only. Contact the hospital to change any of these.">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className={LABEL_CLASS}>Name</dt>
              <dd className="font-semibold text-teal-deep">{user?.name}</dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>Email</dt>
              <dd className="font-semibold text-teal-deep">{user?.email}</dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>Role</dt>
              <dd className="font-semibold text-teal-deep">{humanise(user?.role)}</dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>Status</dt>
              <dd className="font-semibold text-teal-deep">{humanise(user?.status)}</dd>
            </div>
          </dl>
        </PatientCard>

        <PatientCard
          title="Change password"
          description="Use a password you do not use anywhere else."
          className="xl:col-span-2"
        >
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:max-w-md">
            <div>
              <label htmlFor="current-password" className={LABEL_CLASS}>
                Current password
              </label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                required
                value={form.currentPassword}
                onChange={change("currentPassword")}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label htmlFor="new-password" className={LABEL_CLASS}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={form.newPassword}
                onChange={change("newPassword")}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className={LABEL_CLASS}>
                Confirm new password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirmPassword}
                onChange={change("confirmPassword")}
                className={FIELD_CLASS}
              />
            </div>
            <div>
              <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
                <Save className="size-4" />
                {saving ? "Updating..." : "Update password"}
              </button>
            </div>
          </form>
        </PatientCard>
      </div>

      <PatientCard title="Notifications" description="How HILMS tells you about your care.">
        <p className="text-sm text-ink-soft">
          HILMS notifies you in the app when your clinic confirms an appointment, issues a prescription, or the
          laboratory verifies a report. There is no stored preference to change yet &mdash; you receive every update
          about your own care.
        </p>
        <p className="mt-3 flex items-start gap-2 text-xs text-ink-soft">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-teal-mid" />
          Saving a preference that the server does not store would look like it worked and quietly do nothing, so no
          such switches are shown here.
        </p>
      </PatientCard>

      <ActiveSessions />
    </PatientPageShell>
  );
}