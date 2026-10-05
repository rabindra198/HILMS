import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, Mail, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { laboratoryApi, getErrorMessage } from "@/services/laboratoryApi";
import { changeMyPassword } from "@/services/adminApi";
import { profileApi } from "@/services/profileApi";
import { LabPageShell, LabCard, LabTrustNote } from "./labUi";
import { ProfileTabs, TABS, ProfileAvatar } from "@/components/profile";
import { ErrorState } from "@/components/common/ErrorState";
import { useAuth } from "@/context/AuthContext";

const fieldClass =
  "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";
const labelClass =
  "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

export default function LabProfile() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [activeTab, setActiveTab] = useState(TABS.PUBLIC);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await laboratoryApi.getProfile();
      setProfile({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || data.contactNumber || "",
      });
    } catch (err) {
      // Kept in state as well as toasted: the fields below initialise to empty
      // strings, so a failed load is otherwise indistinguishable from an
      // account that genuinely has no name or phone number.
      const message = getErrorMessage(err, "Unable to load profile.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUploadPhoto = async (file) => {
    setUploading(true);
    try {
      await profileApi.uploadPhoto(file);
      // Stored and recorded server-side; re-reading the session is what makes it
      // stick across a refresh, and it updates the top bar from the same record.
      await refreshUser();
      await load();
      toast.success("Profile photo updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update your profile photo."));
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    try {
      await profileApi.removePhoto();
      await refreshUser();
      await load();
      toast.success("Profile photo removed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to remove your profile photo."));
    } finally {
      setUploading(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await laboratoryApi.updateProfile({
        name: profile.name.trim(),
        phone: profile.phone.trim() || undefined,
      });
      await refreshUser();
      toast.success("Profile updated.");
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update profile."));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword) {
      toast.error("The new password and its confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await changeMyPassword(password);
      setPassword({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Password changed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to change your password."));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <LabPageShell
      title="Profile Management"
      description="Manage your laboratory account details and security settings."
      actions={
        activeTab === TABS.PUBLIC ? (
          <button
            type="submit"
            form="profile-form"
            disabled={saving || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        ) : (
          <button
            type="submit"
            form="password-form"
            disabled={savingPassword}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
          >
            <Save className="size-4" />
            {savingPassword ? "Saving..." : "Save Changes"}
          </button>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ProfileTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {loadError && !loading ? (
        <ErrorState title="Could not load your profile" description={loadError} onRetry={load} />
      ) : (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <LabCard title="Account" description="Your laboratory profile">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <ProfileAvatar
                name={profile.name || "Laboratory Staff"}
                photoUrl={profile.profilePhotoUrl || user?.profilePhotoUrl}
                size="lg"
                editable
                uploading={uploading}
                onUpload={handleUploadPhoto}
                onRemove={handleRemovePhoto}
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink">
                  {profile.name || "Laboratory Staff"}
                </p>
                <p className="truncate text-sm text-ink-soft">
                  {profile.email}
                </p>
              </div>
            </div>
          </LabCard>
        </div>

        <div className="xl:col-span-2">
          {activeTab === TABS.PUBLIC ? (
            <LabCard title="Contact information">
              <form
                id="profile-form"
                onSubmit={save}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={labelClass}>Full name</span>
                  <div className="relative mt-2">
                    <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      required
                      value={profile.name}
                      onChange={(event) =>
                        setProfile({ ...profile, name: event.target.value })
                      }
                      className={`${fieldClass} pl-10`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={labelClass}>Email</span>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      readOnly
                      type="email"
                      value={profile.email}
                      className={`${fieldClass} bg-softteal/40 pl-10 text-ink-soft`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={labelClass}>Contact number</span>
                  <input
                    value={profile.phone}
                    onChange={(event) =>
                      setProfile({ ...profile, phone: event.target.value })
                    }
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
              </form>
            </LabCard>
          ) : (
            <LabCard title="Change password">
              <form
                id="password-form"
                onSubmit={savePassword}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={labelClass}>Current password</span>
                  <div className="relative mt-2">
                    <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      required
                      type="password"
                      value={password.currentPassword}
                      onChange={(event) =>
                        setPassword({
                          ...password,
                          currentPassword: event.target.value,
                        })
                      }
                      className={`${fieldClass} pl-10`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={labelClass}>New password</span>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password.newPassword}
                    onChange={(event) =>
                      setPassword({
                        ...password,
                        newPassword: event.target.value,
                      })
                    }
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={labelClass}>Confirm new password</span>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password.confirmPassword}
                    onChange={(event) =>
                      setPassword({
                        ...password,
                        confirmPassword: event.target.value,
                      })
                    }
                    className={`mt-2 ${fieldClass}`}
                  />
                </label>
              </form>
            </LabCard>
          )}
        </div>
      </div>
      )}

      <LabTrustNote />
    </LabPageShell>
  );
}
