import { Heart, Stethoscope, FlaskConical, LayoutGrid } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const benefits = [
  {
    icon: Heart,
    title: "For Patients",
    heading: "A smoother healthcare experience",
    desc: "Book appointments, access reports, prescriptions, and medical history.",
    tone: "bg-coral/15 text-coral-dark",
  },
  {
    icon: Stethoscope,
    title: "For Doctors",
    heading: "Less paperwork. Better patient care.",
    desc: "Quickly access patient history, consultations, reports, and prescriptions.",
    tone: "bg-softteal text-teal",
  },
  {
    icon: FlaskConical,
    title: "For Laboratories",
    heading: "A cleaner testing workflow",
    desc: "Manage requests, samples, results, and verified reports efficiently.",
    tone: "bg-softlavender text-[#6a5acf]",
  },
  {
    icon: LayoutGrid,
    title: "For Administrators",
    heading: "Better hospital visibility",
    desc: "Manage operations, appointments, billing, users, and reports from one place.",
    tone: "bg-softcream text-coral-dark",
  },
];

export function Benefits() {
  return (
    <section id="benefits" className="bg-white/60 py-20 lg:py-24">
      <div className="hilms-container">
        <div className="reveal">
          <SectionHeader
            title="Better care for every role"
            description="Each team member gets the clarity they need to do their best work."
          />
        </div>

        <div className="stagger mt-14 grid gap-6 md:grid-cols-2">
          {benefits.map((b) => (
            <div key={b.title} className="hilms-card flex items-start gap-5 p-7">
              <span
                className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${b.tone}`}
              >
                <b.icon className="size-7" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-mutedink">
                  {b.title}
                </p>
                <h3 className="mt-1 text-xl font-bold">{b.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mutedink">
                  {b.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
