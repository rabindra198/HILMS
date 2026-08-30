import { Zap, Network, FolderHeart } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const benefits = [
  {
    icon: Zap,
    title: "Faster Workflow",
    desc: "Reduce manual paperwork and unnecessary delays.",
    tone: "bg-softcream text-coral-dark",
  },
  {
    icon: Network,
    title: "Connected Departments",
    desc: "Keep doctors, laboratories, administrators, and patients synchronized.",
    tone: "bg-softteal text-teal",
  },
  {
    icon: FolderHeart,
    title: "Better Records",
    desc: "Maintain organized digital medical histories and reports.",
    tone: "bg-softlavender text-[#6a5acf]",
  },
];

export function TrustSection() {
  return (
    <section id="about" className="py-20 lg:py-24">
      <div className="hilms-container">
        <div className="reveal">
          <SectionHeader
            badge="💚 Built for Better Healthcare Workflows"
            title="Everything your hospital needs, connected in one place."
            description="HILMS simplifies everyday hospital operations by connecting patient care, doctor consultations, laboratory testing, prescriptions, billing, and medical history into one centralized system."
          />
        </div>

        <div className="stagger mt-14 grid gap-6 md:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="hilms-card p-7 text-center"
            >
              <span
                className={`mx-auto flex size-14 items-center justify-center rounded-2xl ${b.tone}`}
              >
                <b.icon className="size-7" />
              </span>
              <h3 className="mt-5 text-xl font-bold">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mutedink">
                {b.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
