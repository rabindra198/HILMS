import {
  CalendarDays,
  Users,
  FlaskConical,
  FileText,
  Wallet,
  CalendarCheck,
  FlaskRound,
  Pill,
  UserPlus,
  HeartPulse,
  Activity,
} from "lucide-react";
import { DashBadge } from "./Hero";

export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      {/* main dashboard window */}
      <div className="dash-window animate-float-slow p-4 sm:p-5">
        <div className="flex items-center gap-1.5 pb-3">
          <span className="size-2.5 rounded-full bg-coral" />
          <span className="size-2.5 rounded-full bg-[#ffd24a]" />
          <span className="size-2.5 rounded-full bg-teal/50" />
          <span className="ml-3 rounded-lg bg-softteal px-3 py-1 text-xs font-semibold text-teal">
            HILMS · Dashboard
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DashBadge icon={CalendarDays} title="Appointments" value="24" tone="coral" />
          <DashBadge icon={Users} title="Patients" value="1,248" tone="mint" />
          <DashBadge icon={FlaskConical} title="Lab Tests" value="86" tone="lavender" />
          <DashBadge icon={Wallet} title="Revenue" value="Rs.48k" tone="yellow" />
        </div>

        {/* mini chart + rows */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-teal/10 bg-softcream/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-mutedink">
              Appointments
            </p>
            <div className="mt-3 flex h-20 items-end gap-1.5">
              {[45, 70, 50, 85, 60, 95, 75].map((h, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-t-md ${
                    i === 5 ? "bg-coral" : "bg-teal/25"
                  }`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-teal/10 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-mutedink">
              Today&apos;s Schedule
            </p>
            <div className="mt-3 space-y-2.5">
              {[
                { d: "Dr. Sharma", t: "10:30 AM", s: "Confirmed" },
                { d: "Dr. Gurung", t: "11:00 AM", s: "Pending" },
                { d: "Dr. KC", t: "12:00 PM", s: "Confirmed" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-deept">{row.d}</span>
                  <span className="rounded-full bg-softteal px-2 py-0.5 font-semibold text-teal">
                    {row.s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* floating event cards */}
      <div className="animate-float absolute -left-3 top-8 sm:-left-8">
        <FloatingCard
          icon={CalendarCheck}
          title="Appointment Confirmed"
          meta="Cardiology · Dr. Sharma"
        />
      </div>

      <div
        className="animate-float absolute -right-2 top-24 sm:-right-6"
        style={{ animationDelay: "-2s" }}
      >
        <FloatingCard
          icon={FlaskRound}
          title="Lab Report Ready"
          meta="CBC · Normal range"
        />
      </div>

      <div
        className="animate-float absolute -left-2 bottom-24 sm:-left-6"
        style={{ animationDelay: "-4s" }}
      >
        <FloatingCard icon={Pill} title="Prescription Added" meta="2 medicines" />
      </div>

      <div
        className="animate-float absolute -bottom-3 right-6"
        style={{ animationDelay: "-1.5s" }}
      >
        <FloatingCard
          icon={UserPlus}
          title="Patient Registered"
          meta="New patient record"
        />
      </div>

      {/* decorative hearts / flasks */}
      <span className="animate-heart absolute -left-4 top-1/2 flex size-10 items-center justify-center rounded-2xl bg-white/90 text-coral shadow-md sm:-left-12">
        <HeartPulse className="size-5" />
      </span>
      <span className="animate-heart absolute -right-3 top-6 flex size-9 items-center justify-center rounded-2xl bg-softlavender text-[#6a5acf] shadow-md sm:-right-10" style={{ animationDelay: "-1s" }}>
        <Activity className="size-4" />
      </span>
      <span
        className="animate-heart absolute right-8 -bottom-4 flex size-9 items-center justify-center rounded-2xl bg-softteal text-teal shadow-md"
        style={{ animationDelay: "-1.8s" }}
      >
        <FileText className="size-4" />
      </span>
    </div>
  );
}

function FloatingCard({ icon: Icon, title, meta }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-teal/10 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-coral/15 text-coral-dark">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-deept">{title}</p>
        <p className="truncate text-xs text-mutedink">{meta}</p>
      </div>
    </div>
  );
}
