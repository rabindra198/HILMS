import {
  UserPlus,
  CalendarPlus,
  Stethoscope,
  FlaskConical,
  FileCheck2,
  Pill,
  Wallet,
  FolderHeart,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const steps = [
  { icon: UserPlus, title: "Register", desc: "Patient profile is created." },
  { icon: CalendarPlus, title: "Appointment", desc: "Patient selects doctor and appointment slot." },
  { icon: Stethoscope, title: "Consultation", desc: "Doctor reviews history and records diagnosis." },
  { icon: FlaskConical, title: "Laboratory", desc: "Doctor requests tests and laboratory staff processes samples." },
  { icon: FileCheck2, title: "Report", desc: "Verified laboratory results become available." },
  { icon: Pill, title: "Prescription", desc: "Doctor reviews results and creates treatment prescription." },
  { icon: Wallet, title: "Billing", desc: "Consultation and laboratory charges are recorded." },
  { icon: FolderHeart, title: "Medical History", desc: "All records remain connected to the patient's history." },
];

export function WorkflowTimeline() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-blob absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-softcream/70 blur-2xl" />
        <div className="animate-blob absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-softteal/50 blur-2xl" style={{ animationDelay: "-8s" }} />
      </div>

      <div className="hilms-container">
        <div className="reveal">
          <SectionHeader
            badge="🧪 The full healthcare journey"
            title="From Registration to Recovery — Everything Stays Connected"
            description="A single connected workflow across every step of patient care — no paperwork lost in between."
          />
        </div>

        <div className="reveal relative mt-16 hidden lg:block">
          <EKGLine />
        </div>

        <ol className="stagger mt-10 grid gap-6 sm:grid-cols-2 lg:mt-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="hilms-card flex h-full flex-col p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-softteal text-teal">
                    <step.icon className="size-5" />
                  </span>
                  <span className="font-heading text-lg font-extrabold text-coral-dark">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mutedink">
                  {step.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function EKGLine() {
  return (
    <div className="relative">
      <svg
        className="h-14 w-full"
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0 30 H200 L214 30 L222 14 L230 46 L238 30 H400 L414 30 L422 14 L430 46 L438 30 H600 L614 30 L622 14 L630 46 L638 30 H800 L814 30 L822 14 L830 46 L838 30 H1000 L1014 30 L1022 14 L1030 46 L1038 30 H1200"
          stroke="#2e7c67"
          strokeOpacity="0.35"
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
}
