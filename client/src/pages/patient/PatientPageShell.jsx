import { useState } from "react";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/context/AuthContext";

export function PatientPageShell({ title, description, children }) {
  const { user } = useAuth();

  return (
    <div className="min-h-full bg-[#fffaf5]">
      <Header title="Patient portal" patient />
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-1 py-2 sm:space-y-8 sm:px-2 lg:px-4">
        <header className="relative min-h-[220px] overflow-hidden rounded-2xl bg-[linear-gradient(105deg,#11695f_0%,#0c625a_55%,#0b514f_100%)] px-5 py-6 text-white shadow-[0_16px_35px_-24px_rgba(31,74,64,0.9)] sm:px-8 sm:py-8">
          <div className="relative z-10 max-w-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white">Patient workspace</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white">{description || `Welcome, ${user?.name || "patient"}.`}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-white"><span className="rounded-full bg-white/15 px-3 py-2 backdrop-blur-sm">Better care</span><span className="rounded-full bg-white/15 px-3 py-2 backdrop-blur-sm">Faster access</span><span className="rounded-full bg-white/15 px-3 py-2 backdrop-blur-sm">Healthier you</span></div>
          </div>
          <div className="absolute -right-12 -top-20 size-72 rounded-full border-[38px] border-[#57b7a1]/20" />
          <div className="absolute -bottom-28 right-20 size-72 rounded-full border-[26px] border-[#ffb09d]/15" />
          <div className="absolute bottom-0 right-5 hidden h-40 w-[42%] opacity-30 sm:block"><div className="absolute bottom-0 left-[8%] h-28 w-[18%] bg-[#b8e4d2]/40" /><div className="absolute bottom-0 left-[28%] h-36 w-[22%] bg-[#b8e4d2]/35" /><div className="absolute bottom-0 left-[52%] h-24 w-[16%] bg-[#b8e4d2]/45" /><div className="absolute bottom-0 right-[5%] h-32 w-[20%] bg-[#b8e4d2]/30" /><div className="absolute bottom-8 left-[13%] h-1 w-[67%] bg-[#d9eee5]/70" /></div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function PatientCard({ title, description, children, action, className = "" }) {
  return (
    <section className={`rounded-2xl border border-[#eadfd5] bg-white p-5 shadow-[0_12px_30px_-26px_rgba(31,74,64,0.7)] sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold text-[#25332e]">{title}</h2>
          {description && <p className="mt-1 text-sm text-[#718079]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PatientStat({ label, value, note, icon: Icon, tone = "teal" }) {
  const tones = {
    teal: "bg-[#e7f4ee] text-[#1f4a40]",
    coral: "bg-[#fff0eb] text-[#e6674f]",
    gold: "bg-[#fff5d9] text-[#9a6c08]",
    lavender: "bg-[#efebff] text-[#6553b7]",
  };

  return <div className="rounded-2xl border border-[#eadfd5] bg-white p-4 shadow-[0_12px_30px_-26px_rgba(31,74,64,0.7)] sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718079]">{label}</p><p className="mt-2 font-heading text-3xl font-bold text-[#25332e]">{value}</p>{note && <p className="mt-1 text-xs text-[#718079]">{note}</p>}</div><span className={`flex size-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="size-5" /></span></div></div>;
}

export function PatientStatus({ children, tone = "success" }) {
  const styles = tone === "warning" ? "bg-[#fff5d9] text-[#9a6c08]" : tone === "info" ? "bg-[#eaf1ff] text-[#4169a8]" : "bg-[#e7f4ee] text-[#287557]";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}><Check className="size-3.5" />{children}</span>;
}

export function PatientLinkAction({ children }) {
  return <span className="inline-flex items-center gap-1 text-sm font-bold text-[#2e7c67]">{children}<ArrowUpRight className="size-4" /></span>;
}

export function PatientTrustNote() {
  return <div className="flex items-center gap-2 text-xs text-[#718079]"><ShieldCheck className="size-4 text-[#2e7c67]" />Your health information is kept private and secure.</div>;
}

export function usePatientStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(`hilms.patient.${key}`);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const updateValue = (nextValue) => {
    setValue((currentValue) => {
      const resolvedValue = typeof nextValue === "function" ? nextValue(currentValue) : nextValue;
      localStorage.setItem(`hilms.patient.${key}`, JSON.stringify(resolvedValue));
      return resolvedValue;
    });
  };

  return [value, updateValue];
}
