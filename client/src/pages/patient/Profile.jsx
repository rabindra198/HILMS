import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { patientApi, getApiError } from "@/services/patientApi";
import { changeMyPassword } from "@/services/adminApi";
import { profileApi } from "@/services/profileApi";
import { useAuth } from "@/context/AuthContext";
import {
  PatientCard,
  PatientPageShell,
  BLOOD_GROUPS,
  FIELD_CLASS,
  GENDERS,
  LABEL_CLASS,
  SECONDARY_BUTTON,
} from "./patientUi";
import { ProfileTabs, TABS, ProfileAvatar } from "@/components/profile";

export default function PatientProfile() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.PUBLIC);

  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await patientApi.getProfile();
      setProfile(data);
      setForm({
        name: data.name || "",
        phone: data.phone || "",
        contactNumber: data.contactNumber || "",
        address: data.address || "",
        dateOfBirth: data.dateOfBirth
          ? String(data.dateOfBirth).slice(0, 10)
          : "",
        gender: data.gender || "",
        bloodGroup: data.bloodGroup || "",
        allergies: data.allergies || "",
        emergencyContactName: data.emergencyContact?.name || "",
        emergencyContactNumber: data.emergencyContact?.number || "",
      });
      setError("");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const change = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleUploadPhoto = async (file) => {
    setUploading(true);
    try {
      await profileApi.uploadPhoto(file);
      // The upload has already stored the file and recorded it on the account,
      // so re-reading the session is what makes it stick. This is the same read
      // that runs on the next page load, which is why the photo survives a
      // refresh - and it updates the top bar from the same source of truth.
      await refreshUser();
      await load();
      toast.success("Profile photo updated.");
    } catch (requestError) {
      toast.error(getApiError(requestError));
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
    } catch (requestError) {
      toast.error(getApiError(requestError));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        contactNumber: form.contactNumber.trim() || null,
        address: form.address.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        bloodGroup: form.bloodGroup || null,
        allergies: form.allergies.trim() || null,
        emergencyContactName: form.emergencyContactName.trim() || null,
        emergencyContactNumber: form.emergencyContactNumber.trim() || null,
      };
      const updated = await patientApi.updateProfile(payload);
      setProfile(updated);
      await refreshUser();
      toast.success("Profile updated.");
      await load();
    } catch (requestError) {
      toast.error(getApiError(requestError));
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
      toast.error(getApiError(error));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <PatientPageShell
      title="Profile Management"
      description="Manage your personal details and security settings."
      actions={
        activeTab === TABS.PUBLIC ? (
          <>
            <button type="button" onClick={load} className={SECONDARY_BUTTON}>
              <RefreshCw className="size-4" />
              Refresh
            </button>
            <button
              type="submit"
              form="profile-form"
              disabled={saving || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
            >
              <Save className="size-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </>
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

      {error && (
        <p className="rounded-2xl border border-coral/40 bg-coral-pale px-4 py-3 text-sm font-semibold text-coral-dark">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <PatientCard title="Account" description="Your profile">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <ProfileAvatar
                name={form?.name || profile?.name || "Patient"}
                photoUrl={profile?.profilePhotoUrl || user?.profilePhotoUrl}
                size="lg"
                editable
                uploading={uploading}
                onUpload={handleUploadPhoto}
                onRemove={handleRemovePhoto}
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink">
                  {profile?.name || "Patient"}
                </p>
                <p className="truncate text-sm text-ink-soft">
                  {profile?.email}
                </p>
              </div>
            </div>
          </PatientCard>
        </div>

        <div className="xl:col-span-2">
          {activeTab === TABS.PUBLIC ? (
            <PatientCard title="Personal details">
              <form
                id="profile-form"
                onSubmit={submit}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={LABEL_CLASS}>Full name</span>
                  <input
                    required
                    value={form?.name || ""}
                    onChange={change("name")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Phone</span>
                  <input
                    value={form?.phone || ""}
                    onChange={change("phone")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Contact number</span>
                  <input
                    value={form?.contactNumber || ""}
                    onChange={change("contactNumber")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={LABEL_CLASS}>Address</span>
                  <textarea
                    rows={3}
                    value={form?.address || ""}
                    onChange={change("address")}
                    className="mt-2 w-full rounded-xl border border-deept/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Date of birth</span>
                  <input
                    type="date"
                    value={form?.dateOfBirth || ""}
                    onChange={change("dateOfBirth")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Gender</span>
                  <select
                    value={form?.gender || ""}
                    onChange={change("gender")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  >
                    <option value="">Select</option>
                    {GENDERS.map((gender) => (
                      <option key={gender} value={gender}>
                        {gender}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Blood group</span>
                  <select
                    value={form?.bloodGroup || ""}
                    onChange={change("bloodGroup")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  >
                    <option value="">Select</option>
                    {BLOOD_GROUPS.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={LABEL_CLASS}>Allergies</span>
                  <textarea
                    rows={2}
                    value={form?.allergies || ""}
                    onChange={change("allergies")}
                    className="mt-2 w-full rounded-xl border border-deept/15 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Emergency contact name</span>
                  <input
                    value={form?.emergencyContactName || ""}
                    onChange={change("emergencyContactName")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
                <label className="text-sm font-bold text-ink">
                  <span className={LABEL_CLASS}>Emergency contact number</span>
                  <input
                    value={form?.emergencyContactNumber || ""}
                    onChange={change("emergencyContactNumber")}
                    className={`mt-2 ${FIELD_CLASS}`}
                  />
                </label>
              </form>
            </PatientCard>
          ) : (
            <PatientCard title="Change password">
              <form
                id="password-form"
                onSubmit={savePassword}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="text-sm font-bold text-ink sm:col-span-2">
                  <span className={LABEL_CLASS}>Current password</span>
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
                  <span className={LABEL_CLASS}>New password</span>
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
                  <span className={LABEL_CLASS}>Confirm new password</span>
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
            </PatientCard>
          )}
        </div>
      </div>
    </PatientPageShell>
  );
}
