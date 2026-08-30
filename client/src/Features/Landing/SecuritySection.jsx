import { KeyRound, ShieldCheck, FileClock, FolderTree } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const items = [
  {
    icon: KeyRound,
    title: "Role-Based Access",
    desc: "Users only access the modules appropriate to their role.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Authentication",
    desc: "Protected authentication and authorization workflows.",
  },
  {
    icon: FileClock,
    title: "Activity Tracking",
    desc: "Important system actions can be tracked through audit records.",
  },
  {
    icon: FolderTree,
    title: "Organized Records",
    desc: "Patient information remains structured and connected.",
  },
];

export function SecuritySection() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-24">
      <div className="absolute inset-0 -z-10 bg-softteal/40" />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="animate-blob absolute -right-20 top-10 h-72 w-72 rounded-full bg-white/40 blur-2xl" />
        <div className="animate-blob absolute -left-20 bottom-10 h-72 w-72 rounded-full bg-softlavender/50 blur-2xl" style={{ animationDelay: "-9s" }} />
      </div>

      <div className="hilms-container">
        <div className="reveal">
          <SectionHeader
            title="Healthcare Data Deserves Better Protection"
            description="HILMS uses role-based access and controlled workflows to help protect sensitive hospital information while keeping authorized users productive."
          />
        </div>

        <div className="stagger mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-white/70 bg-white/80 p-7 shadow-[0_18px_40px_-18px_rgba(31,74,64,0.2)] backdrop-blur-sm"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-teal text-white">
                <item.icon className="size-6" />
              </span>
              <h3 className="mt-5 text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mutedink">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
