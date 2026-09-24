import { Calendar, ChevronRight, CreditCard, FileText, FlaskConical, HeartPulse, Pill } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PatientCard, PatientLinkAction, PatientPageShell, PatientStat, PatientStatus, PatientTrustNote, usePatientStorage } from "./PatientPageShell";

const defaultAppointments = [{ id: "APT-001", doctor: "Dr. Adhikari", department: "Cardiology", date: "2026-10-02", time: "09:00" }];
const reports = [{ id: "LAB-001", test: "Complete Blood Count", date: "20 Aug 2026", status: "Completed" }];

export default function PatientDashboardContent() {
  const { user } = useAuth();
  const [appointments] = usePatientStorage("appointments", defaultAppointments);
  const [invoices] = usePatientStorage("invoices", [{ id: "INV-001", amount: 1500, status: "Pending" }]);
  const next = appointments[0];

  return <PatientPageShell title={`Good morning, ${user?.name?.split(" ")[0] || "there"}`} description="Your care, appointments, reports, and payments in one calm place.">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PatientStat label="Appointments" value={appointments.length} note="Upcoming visits" icon={Calendar} tone="coral" />
      <PatientStat label="Prescriptions" value="2" note="Active medicines" icon={Pill} tone="teal" />
      <PatientStat label="Lab reports" value={reports.length} note="Ready to review" icon={FlaskConical} tone="gold" />
      <PatientStat label="Outstanding" value={`Rs. ${invoices.filter((item) => item.status !== "Paid").reduce((sum, item) => sum + item.amount, 0).toLocaleString()}`} note="Pending payments" icon={CreditCard} tone="lavender" />
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <PatientCard title="Your next appointment" description="A quick look at what is coming up." action={<Link to="/patient/appointments"><PatientLinkAction>Manage</PatientLinkAction></Link>}>
        {next ? <div className="flex flex-col gap-5 rounded-xl bg-[#f6faf7] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="flex size-14 items-center justify-center rounded-2xl bg-[#dcefe7] text-[#1f4a40]"><HeartPulse className="size-7" /></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718079]">{next.date}</p><h3 className="mt-1 text-lg font-bold text-[#25332e]">{next.doctor}</h3><p className="text-sm text-[#718079]">{next.department} · {next.time}</p></div></div><PatientStatus>Confirmed</PatientStatus></div> : <p className="rounded-xl bg-[#f6faf7] p-5 text-sm text-[#718079]">You have no upcoming appointments.</p>}
      </PatientCard>
      <PatientCard title="Quick actions" description="Common things you may need today."><div className="space-y-2"><Link to="/patient/appointments" className="flex items-center justify-between rounded-xl bg-[#fff0eb] p-3 text-sm font-bold text-[#c65743] transition hover:bg-[#ffe1d9]">Book an appointment <ChevronRight className="size-4" /></Link><Link to="/patient/laboratory-reports" className="flex items-center justify-between rounded-xl bg-[#e7f4ee] p-3 text-sm font-bold text-[#287557] transition hover:bg-[#d7eee2]">View lab reports <ChevronRight className="size-4" /></Link><Link to="/patient/payments" className="flex items-center justify-between rounded-xl bg-[#efebff] p-3 text-sm font-bold text-[#6553b7] transition hover:bg-[#e3dcff]">Review payments <ChevronRight className="size-4" /></Link></div></PatientCard>
    </div>
    <div className="grid gap-6 lg:grid-cols-2">
      <PatientCard title="Recent lab report" action={<Link to="/patient/laboratory-reports"><PatientLinkAction>View all</PatientLinkAction></Link>}><div className="flex items-center gap-4 rounded-xl border border-[#eadfd5] p-4"><span className="flex size-10 items-center justify-center rounded-xl bg-[#fff5d9] text-[#9a6c08]"><FileText className="size-5" /></span><div className="flex-1"><p className="font-bold text-[#25332e]">{reports[0].test}</p><p className="text-sm text-[#718079]">Uploaded {reports[0].date}</p></div><PatientStatus>{reports[0].status}</PatientStatus></div></PatientCard>
      <PatientCard title="Care at a glance"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f6faf7] p-4"><p className="text-xs text-[#718079]">Last consultation</p><p className="mt-1 font-bold text-[#25332e]">20 Aug 2026</p></div><div className="rounded-xl bg-[#f6faf7] p-4"><p className="text-xs text-[#718079]">Care team</p><p className="mt-1 font-bold text-[#25332e]">Dr. Adhikari</p></div></div></PatientCard>
    </div>
    <PatientTrustNote />
  </PatientPageShell>;
}
