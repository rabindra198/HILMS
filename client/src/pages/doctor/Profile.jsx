import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, Mail, RefreshCw, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import { changeMyPassword } from "@/services/adminApi";
import { profileApi } from "@/services/profileApi";
import {
  DoctorPageShell,
  DoctorCard,
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON,
} from "./doctorUi";
import { ProfileTabs, TABS, ProfileAvatar } from "@/components/profile";
import { useAuth } from "@/context/AuthContext";

const EDITABLE = [
  { label: "Full name", field: "name" },
  { label: "Phone", field: "phone" },
  { label: "Contact number", field: "contactNumber" },
  { label: "Department", field: "department" },
  { label: "Qualification", field: "qualification" },
  { label: "Specialisation", field: "specialization" },
];

export default function DoctorProfile() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.PUBLIC);
  const [uploading, setUploading] = useState(false);

  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorApi.getProfile();
      setProfile(result);
      setForm({
        name: result.name || "",
        phone: result.phone || "",
        contactNumber: result.contactNumber || "",
        address: result.address || "",
        department: result.department || "",
        qualification: result.qualification || "",
        specialization: result.specialization || "",
        nmcNumber: result.nmcNumber || "",
        email: result.email || "",
      });
      setDirty(false);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const change = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setDirty(true);
  };

  const handleUploadPhoto = async (file) => {
    setUploading(true);
    try {
      await profileApi.uploadPhoto(file);
      // Stored and recorded server-side; re-reading the session is what makes it
      // stick across a refresh, and it updates the top bar from the same record.
      await refreshUser();
      await load();
      toast.success("Profile photo updated.");
    } catch (e) {
      toast.error(getDoctorApiError(e));
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
    } catch (e) {
      toast.error(getDoctorApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!String(form.name || "").trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const payload = {};
      for (const field of [...EDITABLE.map((entry) => entry.field), "address"]) {
        const value = String(form[field] || "").trim();
        if (value !== String(profile?.[field] || "").trim()) {
          payload[field] = value || undefined;
        }
      }
      if (!Object.keys(payload).length) {
        toast.info("Nothing to save");
        return;
      }
      await doctorApi.updateProfile(payload);
      await refreshUser();
      toast.success("Profile updated");
      await load();
    } catch (saveError) {
      toast.error(getDoctorApiError(saveError));
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
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password changed.");
    } catch (error) {
      toast.error(getDoctorApiError(error));
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <DoctorPageShell title="Profile Management" description="Loading your account...">
        <div className="h-80 animate-pulse rounded-2xl border-2 border-deept/10 bg-white" />
      </DoctorPageShell>
    );
  }

  if (error) {
    return (
      <DoctorPageShell title="Profile Management">
        <DoctorCard>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-heading text-lg font-bold text-coral-dark">Unable to load your profile</p>
            <p className="max-w-sm text-sm text-ink-soft">{error}</p>
            <button type="button" onClick={load} className={SECONDARY_BUTTON}>
              <RefreshCw className="size-4" /> Try again
            </button>
          </div>
        </DoctorCard>
      </DoctorPageShell>
    );
  }

  const photoUrl = profile?.profilePhotoUrl || user?.profilePhotoUrl;

  return (
    <DoctorPageShell
      title="Profile Management"
      description="Manage your professional details and security settings."
      actions={
        activeTab === TABS.PUBLIC ? (
          <button
            type="submit"
            form="profile-form"
            disabled={saving || !dirty}
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <DoctorCard title="Account" description="Your doctor profile">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <ProfileAvatar
                name={form.name || profile?.name}
                photoUrl={photoUrl}
                size="lg"
                editable
                uploading={uploading}
                onUpload={handleUploadPhoto}
                onRemove={handleRemovePhoto}
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink">{profile?.name || "Doctor"}</p>
                <p className="truncate text-sm text-ink-soft">{profile?.email}</p>
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-teal-pale px-2.5 py-1 text-xs font-semibold text-teal-mid">
                  Doctor
                </p>
              </div>
            </div>
          </DoctorCard>
        </div>

        <div className="xl:col-span-2">
          {activeTab === TABS.PUBLIC ? (
            <DoctorCard title="Public profile">
              <form id="profile-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                {EDITABLE.map(({ label, field }) => (
                  <label key={field} className="text-sm font-bold text-ink">
                    <span className={LABEL_CLASS}>{label}</span>
                    <input
                      value={form[field] || ""}
                      onChange={change(field)}
                      className={`mt-2 ${FIELD_CLASS}`}
                    />
                  </label>
                ))}
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={LABEL_CLASS}>Address</span>
                  <textarea
                    rows={3}
                    value={form.address || ""}
                    onChange={change("address")}
                    className="mt-2 w-full rounded-xl border border-deept/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Email</span>
                  <div className="relative mt-2">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      readOnly
                      type="email"
                      value={form.email || ""}
                      className={`${FIELD_CLASS} bg-softteal/40 pl-10 text-ink-soft`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>NMC number (read-only)</span>
                  <input
                    readOnly
                    value={form.nmcNumber || "-"}
                    className={`mt-2 ${FIELD_CLASS} bg-softteal/40 text-ink-soft`}
                  />
                </label>
              </form>
            </DoctorCard>
          ) : (
            <DoctorCard title="Change password">
              <form id="password-form" onSubmit={savePassword} className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={LABEL_CLASS}>Current password</span>
                  <div className="relative mt-2">
                    <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                    <input
                      required
                      type="password"
                      value={password.currentPassword}
                      onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })}
                      className={`${FIELD_CLASS} pl-10`}
                    />
                  </div>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>New password</span>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password.newPassword}
                    onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Confirm new password</span>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={password.confirmPassword}
                    onChange={(event) => setPassword({ ...password, confirmPassword: event.target.value })}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
              </form>
            </DoctorCard>
          )}
        </div>
      </div>
    </DoctorPageShell>
  );
}

