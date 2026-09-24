import { useEffect, useMemo, useState } from "react";
import { Bell, Search, Menu, CalendarDays, FlaskConical, X, CreditCard, FileText, Pill, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { UserMenu } from "@/components/layout/UserMenu";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";

function LaboratorySearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); return undefined; }
    const timer = setTimeout(() => laboratoryApi.search(query).then(setResults).catch((err) => setError(getApiError(err))), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const groups = results ? [
    ["Patients", results.patients, (item) => item.name, (item) => item.email],
    ["Requests", results.requests, (item) => item.test?.name || item.test?.testName || "Laboratory request", (item) => item.patient?.name || item._id],
    ["Samples", results.samples, (item) => item.sampleId, (item) => item.patient?.name || item.sampleType],
    ["Tests", results.tests, (item) => item.testName || item.name, (item) => item.testCode || item.category],
    ["Reports", results.reports, (item) => item.reportId, (item) => item.patient?.name || item.status],
  ].filter(([, items]) => items?.length) : [];

  return <div className="relative hidden md:block"><div className="flex items-center gap-2 rounded-xl border border-[#e1e9ed] bg-[#f5f8fa] px-3"><Search className="size-4 text-[#5f8496]" /><input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} type="search" placeholder="Search appointments, doctors, reports..." className="h-9 w-72 bg-transparent text-sm text-[#25332e] outline-none placeholder:text-[#78909c]" /></div>{open && query.length >= 2 && <><button aria-label="Close laboratory search results" className="fixed inset-0 z-40 h-full w-full cursor-default" onClick={() => setOpen(false)} /><div className="absolute left-0 top-12 z-50 w-[390px] overflow-hidden rounded-2xl border border-[#e1e9ed] bg-white shadow-xl"><div className="border-b border-[#eef2f3] px-4 py-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718079]">Laboratory search</p><p className="mt-1 text-xs text-[#9ab3a6]">Authorized laboratory information only.</p></div>{error ? <p className="p-4 text-sm text-[#c65743]">{error}</p> : groups.length ? <div className="max-h-[360px] overflow-y-auto p-2">{groups.map(([name, items, title, detail]) => <div key={name} className="mb-2"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e7c67]">{name}</p>{items.map((item) => <div key={item._id || item.reportId || item.sampleId} className="rounded-xl px-3 py-2.5 hover:bg-[#f1faf5]"><p className="truncate text-sm font-bold text-[#25332e]">{title(item)}</p><p className="truncate text-xs text-[#718079]">{detail(item)}</p></div>)}</div>)}</div> : <p className="p-4 text-center text-sm text-[#718079]">No matching laboratory information found.</p>}</div></>}</div>;
}

function LaboratoryNotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { laboratoryApi.getNotifications().then(setItems).catch(() => {}); }, []);
  const unread = items.filter((item) => !item.readAt).length;
  return <div className="relative"><button onClick={() => setOpen(!open)} aria-label="Open laboratory notifications" className="relative flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors"><Bell className="size-4 text-teal-deep" />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-coral text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}</button>{open && <><button aria-label="Close laboratory notifications" className="fixed inset-0 z-40 h-full w-full cursor-default" onClick={() => setOpen(false)} /><div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-[#e1e9ed] bg-white shadow-xl"><div className="border-b border-[#eef2f3] px-4 py-3"><p className="font-bold text-[#25332e]">Laboratory notifications</p><p className="text-xs text-[#718079]">{unread} unread update{unread === 1 ? "" : "s"}</p></div><div className="max-h-64 overflow-y-auto p-2">{items.slice(0, 4).map((item) => <div key={item._id} className="rounded-xl p-3 hover:bg-[#f5faf7]"><p className="text-sm font-bold text-[#25332e]">{item.title}</p><p className="mt-1 text-xs leading-5 text-[#718079]">{item.message}</p></div>)}{!items.length && <p className="p-3 text-sm text-[#718079]">No notifications.</p>}</div><Link to="/lab/notifications" onClick={() => setOpen(false)} className="block border-t border-[#eef2f3] px-4 py-3 text-center text-sm font-bold text-[#2e7c67]">View all notifications</Link></div></>}</div>;
}

export function Header({ onToggleMobileSidebar, title = "Dashboard", patient = false }) {
  const { user } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const searchRecords = useMemo(() => {
    let appointments = [];
    let invoices = [];
    try {
      appointments = JSON.parse(localStorage.getItem("hilms.patient.appointments") || "[]");
      invoices = JSON.parse(localStorage.getItem("hilms.patient.invoices") || "[]");
    } catch {
      appointments = [];
      invoices = [];
    }

    return [
      ...appointments.map((item) => ({ category: "Appointments", title: `Appointment with ${item.doctor}`, detail: `${item.date} at ${item.time}`, href: "/patient/appointments", icon: CalendarDays, terms: `${item.doctor} ${item.department} appointment upcoming past` })),
      { category: "Doctors", title: "Dr. Sharma", detail: "General Medicine", href: "/patient/appointments", icon: Stethoscope, terms: "dr sharma general medicine doctor" },
      { category: "Doctors", title: "Dr. Adhikari", detail: "Cardiology", href: "/patient/appointments", icon: Stethoscope, terms: "dr adhikari cardiologist cardiology doctor" },
      { category: "Medical History", title: "Consultation — Dr. Sharma", detail: "Previous diagnosis and medical records", href: "/patient/medical-history", icon: FileText, terms: "blood pressure previous diagnosis medical records consultation dr sharma" },
      { category: "Prescriptions", title: "Paracetamol 500 mg", detail: "Active medicine · after meals", href: "/patient/prescriptions", icon: Pill, terms: "paracetamol active medicines prescription" },
      { category: "Prescriptions", title: "Prescription from Dr. Sharma", detail: "Current medication plan", href: "/patient/prescriptions", icon: Pill, terms: "prescription dr sharma medicines" },
      { category: "Lab Reports", title: "Complete Blood Count", detail: "Latest lab report · Completed", href: "/patient/laboratory-reports", icon: FlaskConical, terms: "blood test cbc report latest lab report" },
      ...invoices.map((item) => ({ category: "Payments", title: item.description || item.id, detail: `${item.status} · Rs. ${item.amount?.toLocaleString?.() || item.amount || "0"}`, href: "/patient/payments", icon: CreditCard, terms: `pending payment payment history rs ${item.amount} ${item.description || ""}` })),
    ];
  }, [searchQuery]);
  const searchResults = searchQuery.trim().length < 2 ? [] : searchRecords.filter((record) => record.terms.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0, 8);
  const groupedResults = searchResults.reduce((groups, result) => ({ ...groups, [result.category]: [...(groups[result.category] || []), result] }), {});

  return (
    <header className="relative z-30 flex h-16 items-center justify-between border-b border-[#e6edf0] bg-white px-4 md:px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileSidebar}
          className="flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale md:hidden transition-colors"
        >
          <Menu className="size-5 text-teal-deep" />
        </button>
        <div>
          {!patient && user?.role !== "lab" && <><h1 className="font-heading text-lg font-bold text-teal-deep">{title}</h1><p className="text-sm text-ink-soft">{today}</p></>}
          {user?.role === "lab" && <LaboratorySearch />}
          {patient && <div className="relative hidden md:block"><div className="flex items-center gap-2 rounded-xl border border-[#e1e9ed] bg-[#f5f8fa] px-3"><Search className="size-4 text-[#5f8496]" /><input value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} type="search" placeholder="Search appointments, doctors, reports..." className="h-9 w-72 bg-transparent text-sm text-[#25332e] outline-none placeholder:text-[#78909c]" /></div>{searchOpen && searchQuery.trim().length >= 2 && <><button aria-label="Close patient search results" className="fixed inset-0 z-40 h-full w-full cursor-default" onClick={() => setSearchOpen(false)} /><div className="absolute left-0 top-12 z-50 w-[390px] overflow-hidden rounded-2xl border border-[#e1e9ed] bg-white shadow-xl"><div className="border-b border-[#eef2f3] px-4 py-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#718079]">Search results</p><p className="mt-1 text-xs text-[#9ab3a6]">Only information in your patient portal is searched.</p></div>{searchResults.length > 0 ? <div className="max-h-[360px] overflow-y-auto p-2">{Object.entries(groupedResults).map(([category, results]) => <div key={category} className="mb-2"><p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e7c67]">{category}</p>{results.map((result) => <Link key={`${result.category}-${result.title}`} to={result.href} onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f1faf5]"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e7f4ee] text-[#2e7c67]"><result.icon className="size-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-bold text-[#25332e]">{result.title}</span><span className="block truncate text-xs text-[#718079]">{result.detail}</span></span></Link>)}</div>)}</div> : <p className="px-4 py-6 text-center text-sm text-[#718079]">No matching patient information found.</p>}</div></>}</div>}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden md:flex items-center gap-2">
          {!patient && showSearch ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder={patient ? "Search anything..." : "Search patients, doctors, appointments..."}
                className="h-9 w-64 rounded-xl border border-[#e1e9ed] bg-[#f5f8fa] px-3 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
                autoFocus
                onBlur={() => setShowSearch(false)}
              />
            </div>
          ) : !patient && (
            <button
              onClick={() => setShowSearch(true)}
              className="flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors"
            >
              <Search className="size-4 text-teal-deep" />
            </button>
          )}
        </div>

        {user?.role === "lab" ? <LaboratoryNotificationBell /> : <div className="relative">
        <button onClick={() => setShowNotifications(!showNotifications)} aria-label="Open notifications" className="relative flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors">
          <Bell className="size-4 text-teal-deep" />
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-coral text-[10px] font-bold text-white">3</span>
        </button>
        {showNotifications && <><button aria-label="Close notifications" className="fixed inset-0 z-40 h-full w-full cursor-default" onClick={() => setShowNotifications(false)} /><div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-[#e1e9ed] bg-white shadow-xl"><div className="flex items-center justify-between border-b border-[#eef2f3] px-4 py-3"><div><p className="font-bold text-[#25332e]">Notifications</p><p className="text-xs text-[#718079]">Your latest care updates</p></div><X className="size-4 text-[#9ab3a6]" /></div><div className="space-y-1 p-2"><div className="flex gap-3 rounded-xl p-3 hover:bg-[#f5faf7]"><CalendarDays className="mt-0.5 size-4 text-[#2e7c67]" /><div><p className="text-sm font-bold text-[#25332e]">Appointment reminder</p><p className="text-xs leading-5 text-[#718079]">Your visit with Dr. Adhikari is on 2 Oct.</p></div></div><div className="flex gap-3 rounded-xl p-3 hover:bg-[#f5faf7]"><FlaskConical className="mt-0.5 size-4 text-[#9a6c08]" /><div><p className="text-sm font-bold text-[#25332e]">Lab report ready</p><p className="text-xs leading-5 text-[#718079]">Your Complete Blood Count is available.</p></div></div></div><Link to="/patient/notifications" onClick={() => setShowNotifications(false)} className="block border-t border-[#eef2f3] px-4 py-3 text-center text-sm font-bold text-[#2e7c67] hover:bg-[#f5faf7]">View all notifications</Link></div></>}
        </div>}

        <UserMenu />
      </div>
    </header>
  );
}
