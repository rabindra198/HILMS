import { User, Bell, Shield, Palette } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
          Settings
        </h1>
        <p className="text-base text-ink-soft font-medium">
          Manage your account and application preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Account Settings */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-teal-pale">
                <User className="size-5 text-teal-mid" />
              </div>
              <h2 className="font-heading text-xl font-bold text-teal-deep">Account Settings</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>Full Name</label>
                <input
                  type="text"
                  defaultValue="Admin User"
                  className="h-11 w-full rounded-xl border border-deept/15 bg-white px-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>Email</label>
                <input
                  type="email"
                  defaultValue="admin@hilms.com"
                  className="h-11 w-full rounded-xl border border-deept/15 bg-white px-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
                />
              </div>
            </div>
            <button className="mt-6 inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
              Update Account
            </button>
          </div>

          {/* Notification Preferences */}
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-lavender-pale">
                <Bell className="size-5 text-lavender" />
              </div>
              <h2 className="font-heading text-xl font-bold text-teal-deep">Notification Preferences</h2>
            </div>
            <div className="space-y-4">
              {[
                { label: "New appointment notifications", defaultChecked: true },
                { label: "Lab report ready alerts", defaultChecked: true },
                { label: "New patient registration alerts", defaultChecked: false },
                { label: "System maintenance notifications", defaultChecked: true },
              ].map((item, i) => (
                <label key={i} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm font-medium text-ink">{item.label}</span>
                  <input
                    type="checkbox"
                    defaultChecked={item.defaultChecked}
                    className="size-4 rounded border-deept/20 text-coral focus:ring-coral"
                  />
                </label>
              ))}
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
            <button className="w-full rounded-full border-2 border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep hover:bg-teal-pale hover:border-teal-pale transition-all">
              Change Password
            </button>
          </div>

          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-sand">
                <Palette className="size-5 text-coral-dark" />
              </div>
              <h2 className="font-heading text-lg font-bold text-teal-deep">Appearance</h2>
            </div>
            <p className="text-sm text-ink-soft mb-4">Customize the look and feel of your dashboard.</p>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-ink">Theme:</span>
              <span className="rounded-full bg-teal-pale px-3 py-1 text-xs font-semibold text-teal-mid">Light</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
