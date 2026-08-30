import {
  CalendarDays,
  Stethoscope,
  Users,
  FlaskConical,
  Pill,
  FolderHeart,
  CreditCard,
  BellRing,
  KeyRound,
} from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const features = [
  { icon: CalendarDays, title: "Appointment Management", desc: "Book, reschedule, cancel, and manage appointments." },
  { icon: Stethoscope, title: "Doctor Management", desc: "Manage doctors, schedules, availability, and consultations." },
  { icon: Users, title: "Patient Management", desc: "Register patients and maintain their medical information." },
  { icon: FlaskConical, title: "Laboratory Management", desc: "Manage test requests, samples, results, and reports." },
  { icon: Pill, title: "Digital Prescriptions", desc: "Create and manage electronic prescriptions." },
  { icon: FolderHeart, title: "Medical History", desc: "Keep consultations, reports, and records connected." },
  { icon: CreditCard, title: "Billing & Payments", desc: "Manage consultation fees, laboratory charges, and invoices." },
  { icon: BellRing, title: "Notifications", desc: "Keep users informed about appointments and important updates." },
  { icon: KeyRound, title: "Role-Based Access", desc: "Give each user access only to the features they are authorized to use." },
];

export function Features() {
  return (
    <section id="features" className="bg-white/60 py-20 lg:py-24">
      <div className="hilms-container">
        <div className="reveal">
          <SectionHeader
            badge="✨ Built to simplify"
            title="Everything Your Hospital Needs"
            description="A complete set of connected modules for managing care, tests, and records — all in one place."
          />
        </div>

        <div className="stagger mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="hilms-card group flex items-start gap-4 p-6">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-softteal text-teal transition-colors group-hover:bg-teal group-hover:text-white">
                <f.icon className="size-6" />
              </span>
              <div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mutedink">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
