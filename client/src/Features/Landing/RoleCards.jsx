import { Link } from "react-router-dom";
import { Heart, Stethoscope, FlaskConical, LayoutGrid, ArrowRight, Check } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const roles = [
  {
    icon: Heart,
    title: "Patient",
    link: "/signup",
    cta: "Patient Portal",
    tone: "bg-coral/15 text-coral-dark",
    dot: "bg-coral",
    features: [
      "Book appointments",
      "View medical history",
      "View prescriptions",
      "View lab reports",
      "Track bills",
    ],
  },
  {
    icon: Stethoscope,
    title: "Doctor",
    link: "/signup",
    cta: "Doctor Workspace",
    tone: "bg-softteal text-teal",
    dot: "bg-teal",
    features: [
      "View appointments",
      "Review patient history",
      "Record diagnosis",
      "Request laboratory tests",
      "Create prescriptions",
    ],
  },
  {
    icon: FlaskConical,
    title: "Laboratory",
    link: "/signup",
    cta: "Laboratory Workspace",
    tone: "bg-softlavender text-[#6a5acf]",
    dot: "bg-[#6a5acf]",
    features: [
      "Receive test requests",
      "Manage samples",
      "Enter test results",
      "Verify reports",
      "Publish laboratory reports",
    ],
  },
  {
    icon: LayoutGrid,
    title: "Admin",
    link: "/signup",
    cta: "Admin Dashboard",
    tone: "bg-softcream text-coral-dark",
    dot: "bg-coral-dark",
    features: [
      "Manage patients",
      "Manage doctors",
      "Manage appointments",
      "Manage billing",
      "Monitor hospital operations",
    ],
  },
];

export function RoleCards() {
  return (
    <section id="roles" className="bg-white/60 py-20 lg:py-24">
      <div className="hilms-container">
        <div className="reveal">
          <SectionHeader
            badge="🧑‍⚕️ Tailored for every team"
            title="One Platform. Every Healthcare Role."
            description="Every user gets a personalized workspace designed around their responsibilities."
          />
        </div>

        <div className="stagger mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => (
            <div
              key={role.title}
              className="hilms-card flex flex-col p-7"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex size-12 items-center justify-center rounded-2xl ${role.tone}`}
                >
                  <role.icon className="size-6" />
                </span>
                <span className={`size-2.5 rounded-full ${role.dot}`} />
              </div>

              <h3 className="mt-5 text-xl font-bold">{role.title}</h3>

              <ul className="mt-4 flex-1 space-y-2.5">
                {role.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-mutedink"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-teal" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                to={role.link}
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-coral-dark transition-colors hover:text-deept"
              >
                {role.cta} <ArrowRight className="size-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
