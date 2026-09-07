import { useState, useEffect } from "react";
import { toast } from "sonner";
import { User, Bell, Shield, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorSettings } from "@/services/doctorFallback";

const DEFAULT_NOTIFICATIONS = {
  appointmentReminders: true,
  labReportAlerts: true,
  followUpReminders: true,
  newPatientAlerts: false,
  systemMaintenance: true,
};

export default function DoctorSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [theme, setTheme] = useState("Light");
  const [password, setPassword] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  useEffect(() => {
    doctorApi
      .getSettings()
      .then((d) => {
        const s = d.settings || {};
        setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(s.notifications || {}) });
        setTheme(s.theme || "Light");
        setLoading(false);
      })
      .catch(() => {
        const s = fallbackDoctorSettings.settings;
        setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(s.notifications || {}) });
        setTheme(s.theme || "Light");
        setLoading(false);
      });
  }, []);

  const handleNotificationChange = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await doctorApi.updateSettings({ notifications });
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Unable to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTheme = async (value) => {
    try {
      const next = value;
      setTheme(next);
      await doctorApi.updateSettings({ theme: next });
      toast.success(`${next} theme selected`);
    } catch {
      toast.error("Unable to update theme. Please try again.");
    }
  };

  const handleChangePassword = async () => {
    if (password.new.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (password.new !== password.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    toast.success("Password change is handled through your account login. Contact support if needed.");
    setPassword({ current: "", new: "", confirm: "" });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">Settings</h1>
          <p className="text-base text-ink-soft font-medium">Manage your clinical preferences and account settings.</p>
        </div>
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-cream" />
          <div className="h-40 animate-pulse rounded-2xl bg-cream" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
          Settings
        </h1>
        <p className="text-base text-ink-soft font-medium">
          Manage your clinical preferences and account settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Clinical Notification Preferences */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-teal-pale">
                <Bell className="size-5 text-teal-mid" />
              </div>
              <h2 className="font-heading text-xl font-bold text-teal-deep">Notification Preferences</h2>
            </div>
            <div className="space-y-4">
              {[
                { key: "appointmentReminders", label: "Appointment reminders", desc: "Get notified before scheduled appointments", defaultChecked: true },
                { key: "labReportAlerts", label: "Lab report ready alerts", desc: "Notify when laboratory results are available", defaultChecked: true },
                { key: "followUpReminders", label: "Follow-up reminders", desc: "Reminders for upcoming follow-up visits", defaultChecked: true },
                { key: "newPatientAlerts", label: "New patient registration alerts", desc: "Notify when a new patient is assigned to you", defaultChecked: false },
                { key: "systemMaintenance", label: "System maintenance notifications", desc: "Important system updates and downtime alerts", defaultChecked: true },
              ].map((item) => (
                <label key={item.key} className="flex items-start justify-between cursor-pointer">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-ink">{item.label}</span>
                    <p className="text-xs text-ink-soft mt-0.5">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={() => handleNotificationChange(item.key)}
                    className="mt-0.5 size-4 rounded border-deept/20 text-coral focus:ring-coral"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6">
              <Button onClick={handleSaveNotifications} disabled={saving}>
                <Save className="size-4" /> {saving ? "Saving..." : "Save Preferences"}
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar Cards */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-coral-pale">
                <Shield className="size-5 text-coral-dark" />
              </div>
              <h2 className="font-heading text-lg font-bold text-teal-deep">Security</h2>
            </div>
            <p className="text-sm text-ink-soft mb-4">Keep your account secure by updating your password regularly.</p>
            <div className="flex flex-col gap-3">
              <Input type="password" placeholder="Current password" value={password.current} onChange={(e) => setPassword((p) => ({ ...p, current: e.target.value }))} />
              <Input type="password" placeholder="New password" value={password.new} onChange={(e) => setPassword((p) => ({ ...p, new: e.target.value }))} />
              <Input type="password" placeholder="Confirm new password" value={password.confirm} onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))} />
              <Button variant="outline" className="w-full" onClick={handleChangePassword}>
                Change Password
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-sand">
                <Palette className="size-5 text-coral-dark" />
              </div>
              <h2 className="font-heading text-lg font-bold text-teal-deep">Appearance</h2>
            </div>
            <p className="text-sm text-ink-soft mb-4">Customize the look and feel of your dashboard.</p>
            <div className="flex gap-2">
              {["Light", "Dark"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleSaveTheme(t)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border ${
                    theme === t
                      ? "border-teal-mid bg-teal-pale text-teal-mid"
                      : "border-deept/10 bg-white text-ink-soft hover:bg-cream"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-cream">
                <User className="size-5 text-teal-deep" />
              </div>
              <h2 className="font-heading text-lg font-bold text-teal-deep">Profile</h2>
            </div>
            <p className="text-sm text-ink-soft mb-4">Edit your professional information, specialization, and working hours.</p>
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = "/doctor/profile")}>
              Edit Profile
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}