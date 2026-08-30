import {
  ShieldCheck,
  ClipboardList,
  FlaskConical,
  MonitorSmartphone,
} from "lucide-react";
import { HeroVisual } from "./HeroVisual";

const trust = [
  { icon: ShieldCheck, label: "Secure Role-Based Access" },
  { icon: ClipboardList, label: "Digital Medical Records" },
  { icon: FlaskConical, label: "Integrated Laboratory" },
  { icon: MonitorSmartphone, label: "Responsive Platform" },
];

export function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden pb-16 pt-28 lg:pb-24 lg:pt-36"
    >
      {/* decorative blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-blob absolute -right-16 -top-20 h-72 w-72 rounded-full bg-softteal/70 blur-2xl" />
        <div className="animate-blob absolute -left-20 top-32 h-72 w-72 rounded-full bg-softlavender/80 blur-2xl" style={{ animationDelay: "-6s" }} />
        <div className="animate-blob absolute bottom-0 left-1/3 h-60 w-60 rounded-full bg-softcream/90 blur-2xl" style={{ animationDelay: "-11s" }} />
      </div>

      <div className="hilms-container grid items-center gap-12 lg:grid-cols-2">
        <div className="reveal">
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl lg:text-[3.4rem]">
            One connected system for your{" "}
            <span className="text-coral">hospital</span> &amp;{" "}
            <span className="text-coral">laboratory.</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mutedink">
            HILMS brings patients, doctors, laboratories, and administrators
            together in one simple and secure platform — from appointment
            booking to verified laboratory reports and digital prescriptions.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#features"
              className="hilms-btn hilms-btn-coral h-13 px-8 text-base"
            >
              Discover Features
            </a>
            <a
              href="#how-it-works"
              className="hilms-btn hilms-btn-outline h-13 px-8 text-base"
            >
              See How It Works
            </a>
          </div>

          <ul className="mt-10 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            {trust.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2.5 text-sm font-semibold text-mutedink"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-softteal text-teal">
                  <item.icon className="size-4" />
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

export function DashBadge({ icon: Icon, title, value, tone }) {
  const tones = {
    mint: "bg-softteal text-teal",
    coral: "bg-softcream text-coral-dark",
    lavender: "bg-softlavender text-[#6a5acf]",
    yellow: "bg-[#fff4d6] text-[#c79100]",
  };
  return (
    <div className="rounded-2xl border border-teal/10 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-mutedink">
        <span className={`flex size-8 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-4" />
        </span>
        {title}
      </div>
      <p className="mt-2 text-3xl font-extrabold text-deept">{value}</p>
    </div>
  );
}
