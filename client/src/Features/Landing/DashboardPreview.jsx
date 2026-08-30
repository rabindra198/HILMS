import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  FlaskConical,
  Pill,
  CreditCard,
  FileText,
  Settings,
  CalendarCheck,
  UserPlus,
  FlaskRound,
  TrendingUp,
  HeartPulse,
} from "lucide-react";

const sidebar = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "Patients" },
  { icon: CalendarDays, label: "Appointments" },
  { icon: Stethoscope, label: "Doctors" },
  { icon: FlaskConical, label: "Laboratory" },
  { icon: Pill, label: "Prescriptions" },
  { icon: CreditCard, label: "Billing" },
  { icon: FileText, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

const cards = [
  { icon: CalendarCheck, title: "Today's Appointments", value: "24", tone: "bg-softcream text-coral-dark" },
  { icon: UserPlus, title: "New Patients", value: "12", tone: "bg-softteal text-teal" },
  { icon: FlaskRound, title: "Pending Lab Tests", value: "8", tone: "bg-softlavender text-[#6a5acf]" },
  { icon: TrendingUp, title: "Revenue", value: "Rs. 48,500", tone: "bg-[#fff4d6] text-[#c79100]" },
];

export function DashboardPreview() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-blob absolute -right-24 top-20 h-80 w-80 rounded-full bg-softlavender/50 blur-2xl" />
        <div className="animate-blob absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-softteal/50 blur-2xl" style={{ animationDelay: "-7s" }} />
      </div>

      <div className="hilms-container">
        <div className="reveal">
          <div className="dash-window">
            <div className="flex flex-col md:flex-row">
              {/* sidebar */}
              <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-teal/10 bg-softteal/40 p-4 md:flex">
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-coral to-lavender text-white">
                    <HeartPulse className="size-4" />
                  </span>
                  <span className="text-sm font-extrabold text-deept">HILMS</span>
                </div>
                {sidebar.map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                      item.active
                        ? "bg-white text-deept shadow-sm"
                        : "text-mutedink"
                    }`}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </div>
                ))}
                <div className="mt-auto flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm">
                  <span className="flex size-8 items-center justify-center rounded-full bg-softlavender text-sm font-extrabold text-[#6a5acf]">
                    A
                  </span>
                  <div className="leading-tight">
                    <p className="text-xs font-bold text-deept">Admin</p>
                    <p className="text-[10px] text-mutedink">Administrator</p>
                  </div>
                </div>
              </aside>

              {/* main */}
              <div className="min-w-0 flex-1 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-extrabold text-deept">Good morning 🌤️</h3>
                    <p className="text-sm text-mutedink">Here&apos;s what&apos;s happening today.</p>
                  </div>
                  <span className="rounded-xl bg-softteal px-4 py-2 text-sm font-bold text-teal">
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {cards.map((c) => (
                    <div
                      key={c.title}
                      className="rounded-2xl border border-teal/10 p-4"
                    >
                      <span
                        className={`flex size-9 items-center justify-center rounded-xl ${c.tone}`}
                      >
                        <c.icon className="size-4.5" />
                      </span>
                      <p className="mt-3 text-2xl font-extrabold text-deept">
                        {c.value}
                      </p>
                      <p className="text-xs font-medium text-mutedink">{c.title}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-teal/10 p-4 lg:col-span-2">
                    <p className="text-sm font-bold text-deept">Appointment Trend</p>
                    <div className="mt-4 flex h-28 items-end gap-2">
                      {[30, 55, 40, 70, 50, 85, 62, 90, 68, 96, 72, 100].map((h, i) => (
                        <span
                          key={i}
                          className={`flex-1 rounded-t-md ${i >= 9 ? "bg-coral" : "bg-teal/25"}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-semibold text-mutedink">
                      <span>Mon</span>
                      <span>Tue</span>
                      <span>Wed</span>
                      <span>Thu</span>
                      <span>Fri</span>
                      <span>Sat</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-teal/10 p-4">
                    <p className="text-sm font-bold text-deept">Laboratory Status</p>
                    <div className="mt-4 space-y-3">
                      {[
                        { l: "CBC", s: "Completed", ok: true },
                        { l: "Lipid Profile", s: "Processing", ok: false },
                        { l: "Blood Sugar", s: "Completed", ok: true },
                      ].map((r) => (
                        <div
                          key={r.l}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-deept">{r.l}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${
                              r.ok
                                ? "bg-softteal text-teal"
                                : "bg-softcream text-coral-dark"
                            }`}
                          >
                            {r.s}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-teal/10 p-4">
                  <p className="text-sm font-bold text-deept">Recent Patients</p>
                  <div className="mt-3 hidden overflow-x-auto sm:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-teal/10 text-left text-xs uppercase tracking-wide text-mutedink">
                          <th className="pb-2 pr-4 font-semibold">Patient</th>
                          <th className="pb-2 pr-4 font-semibold">Department</th>
                          <th className="pb-2 pr-4 font-semibold">Status</th>
                          <th className="pb-2 font-semibold">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { n: "Raj Sharma", d: "Cardiology", s: "Confirmed", t: "10:30 AM" },
                          { n: "Sita Thapa", d: "General Med", s: "Waiting", t: "11:00 AM" },
                          { n: "Hari Gurung", d: "Dermatology", s: "Completed", t: "11:30 AM" },
                        ].map((r) => (
                          <tr key={r.n} className="border-b border-teal/5 last:border-0">
                            <td className="py-2.5 pr-4 font-semibold text-deept">{r.n}</td>
                            <td className="py-2.5 pr-4 text-mutedink">{r.d}</td>
                            <td className="py-2.5 pr-4">
                              <span className="rounded-full bg-softteal px-2.5 py-0.5 text-xs font-semibold text-teal">
                                {r.s}
                              </span>
                            </td>
                            <td className="py-2.5 text-mutedink">{r.t}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 sm:hidden">
                    {[
                      { n: "Raj Sharma", d: "Cardiology", s: "Confirmed" },
                      { n: "Sita Thapa", d: "General Med", s: "Waiting" },
                      { n: "Hari Gurung", d: "Dermatology", s: "Completed" },
                    ].map((r) => (
                      <div
                        key={r.n}
                        className="flex items-center justify-between rounded-xl bg-softcream/50 px-3 py-2"
                      >
                        <span className="text-sm font-semibold text-deept">{r.n}</span>
                        <span className="text-xs text-mutedink">{r.d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
