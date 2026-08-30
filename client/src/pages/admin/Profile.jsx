export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
          Profile
        </h1>
        <p className="text-base text-ink-soft font-medium">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-xl font-bold text-teal-deep mb-4">Personal Information</h2>
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
              <div>
                <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>Phone</label>
                <input
                  type="text"
                  defaultValue="98XXXXXXXX"
                  className="h-11 w-full rounded-xl border border-deept/15 bg-white px-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>Role</label>
                <input
                  type="text"
                  defaultValue="Administrator"
                  disabled
                  className="h-11 w-full rounded-xl border border-deept/15 bg-cream px-4 text-sm text-ink-soft outline-none"
                />
              </div>
            </div>
            <button className="mt-6 inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
              Save Changes
            </button>
          </div>
        </div>

        <div>
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h2 className="font-heading text-xl font-bold text-teal-deep mb-4">Avatar</h2>
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-coral to-lavender">
                <span className="font-heading text-2xl font-bold text-white">A</span>
              </div>
              <button className="text-sm font-semibold text-teal-mid hover:underline">
                Change Photo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
