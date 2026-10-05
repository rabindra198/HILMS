import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, Mail, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from "@/services/adminApi";
import { getErrorMessage } from "@/services/adminApi";
import { profileApi } from "@/services/profileApi";
import { AdminPageShell, AdminCard } from "./AdminUi";
import { ProfileTabs, TABS, ProfileAvatar } from "@/components/profile";
import { ErrorState } from "@/components/common/ErrorState";
import { useAuth } from "@/context/AuthContext";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-deept/15 bg-white px-4 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";

const EMPTY_FORM = { name: "", email: "", contactNumber: "", address: "" };
const EMPTY_PASSWORD = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.PUBLIC);

  const [password, setPassword] = useState(EMPTY_PASSWORD);
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await getMyProfile();
      setProfile(result);
      setForm({
        name: result?.name ?? "",
        email: result?.email ?? "",
        contactNumber: result?.contactNumber ?? result?.phone ?? "",
        address: result?.address ?? "",
      });
    } catch (err) {
      // A toast vanishes; the page behind it then looks like an account with no
      // name and no address, which reads as real data rather than a failed load.
      // The error is kept in state so the page can say so and offer a retry.
      const message = getErrorMessage(err, "Unable to load your profile.");
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
    } catch (uploadError) {
      toast.error(getErrorMessage(uploadError, "Unable to update your profile photo."));
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
    } catch (removeError) {
      toast.error(getErrorMessage(removeError, "Unable to remove your profile photo."));
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateMyProfile({
        name: form.name,
        email: form.email,
        contactNumber: form.contactNumber,
        address: form.address,
      });
      setProfile(updated);
      setForm({
        name: updated?.name ?? "",
        email: updated?.email ?? "",
        contactNumber: updated?.contactNumber ?? updated?.phone ?? "",
        address: updated?.address ?? "",
      });
      await refreshUser();
      toast.success("Your profile has been updated.");
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "Unable to update your profile."));
    } finally {
      setSavingProfile(false);
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
      setPassword(EMPTY_PASSWORD);
      toast.success("Password changed.");
    } catch (saveError) {
      toast.error(
        getErrorMessage(saveError, "Unable to change your password."),
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <AdminPageShell
      title="Profile Management"
      description="Manage your administrator account details and security settings."
      actions={
        activeTab === TABS.PUBLIC ? (
          <button
            type="submit"
            form="profile-form"
            disabled={savingProfile || loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
          >
            <Save className="size-4" />
            {savingProfile ? "Saving..." : "Save Changes"}
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
        <ErrorState
          title="Could not load your profile"
          description={loadError}
          onRetry={load}
        />
      ) : (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <AdminCard title="Account" description="Your profile">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <ProfileAvatar
                name={form.name || profile?.name || "Administrator"}
                photoUrl={profile?.profilePhotoUrl || user?.profilePhotoUrl}
                size="lg"
                editable
                uploading={uploading}
                onUpload={handleUploadPhoto}
                onRemove={handleRemovePhoto}
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink">
                  {profile?.name || "Administrator"}
                </p>
                <p className="truncate text-sm text-ink-soft">
                  {profile?.email}
                </p>
              </div>
            </div>
          </AdminCard>
        </div>

        <div className="xl:col-span-2">
          {activeTab === TABS.PUBLIC ? (
            <AdminCard title="Public profile">
              <form
                id="profile-form"
                onSubmit={saveProfile}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Full name
                  </span>
                  <div className="relative mt-2">
                    <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      required
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                      className={`${FIELD_CLASS} pl-10`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Email
                  </span>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm({ ...form, email: event.target.value })
                      }
                      className={`${FIELD_CLASS} pl-10`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Contact number
                  </span>
                  <input
                    value={form.contactNumber}
                    onChange={(event) =>
                      setForm({ ...form, contactNumber: event.target.value })
                    }
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Address
                  </span>
                  <textarea
                    rows={3}
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-deept/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                  />
                </label>
              </form>
            </AdminCard>
          ) : (
            <AdminCard title="Change password">
              <form
                id="password-form"
                onSubmit={savePassword}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Current password
                  </span>
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
                      className={`${FIELD_CLASS} pl-10`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    New password
                  </span>
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
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Confirm new password
                  </span>
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
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
              </form>
            </AdminCard>
          )}
        </div>
      </div>
      )}
    </AdminPageShell>
  );
}
