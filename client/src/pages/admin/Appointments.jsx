import { useState } from "react";
import { Search, Plus, Eye, Edit, Trash2, Calendar, CalendarCheck, Clock } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";

const mockAppointments = [
  { id: "APT-001", patient: "John Doe", doctor: "Dr. Sharma", dept: "Cardiology", date: "2026-08-23", time: "10:30 AM", type: "Follow-up", status: "Confirmed" },
  { id: "APT-002", patient: "Aarav Thapa", doctor: "Dr. Gurung", dept: "General Medicine", date: "2026-08-23", time: "11:00 AM", type: "New", status: "Waiting" },
  { id: "APT-003", patient: "Sita Rai", doctor: "Dr. KC", dept: "Dermatology", date: "2026-08-23", time: "11:30 AM", type: "Consultation", status: "Completed" },
  { id: "APT-004", patient: "Ram Thapa", doctor: "Dr. Sharma", dept: "Cardiology", date: "2026-08-23", time: "12:00 PM", type: "Follow-up", status: "Confirmed" },
  { id: "APT-005", patient: "Maya Rai", doctor: "Dr. KC", dept: "Dermatology", date: "2026-08-24", time: "09:00 AM", type: "Consultation", status: "Scheduled" },
  { id: "APT-006", patient: "Krishna Shah", doctor: "Dr. Gurung", dept: "General Medicine", date: "2026-08-24", time: "10:30 AM", type: "Follow-up", status: "Confirmed" },
];

export default function AppointmentsPage() {
  const [search, setSearch] = useState("");

  const filteredAppointments = mockAppointments.filter(
    (a) =>
      a.patient.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase()) ||
      a.doctor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Appointments
          </h1>
          <p className="text-base text-ink-soft font-medium">
            Manage and schedule patient appointments.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
          <Plus className="size-4" />
          New Appointment
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-deept/5 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-deept/5">
              <Calendar className="size-5 text-ink-soft" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Today's Appointments</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">86</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-deept/5">
              <CalendarCheck className="size-5 text-ink-soft" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Confirmed</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">64</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-deept/5">
              <Clock className="size-5 text-ink-soft" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Waiting</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">22</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            placeholder="Search by patient, ID, or doctor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
          />
        </div>
        <span className="text-sm font-medium text-ink-soft">
          {filteredAppointments.length} appointments found
        </span>
      </div>

      {/* Appointments Table */}
      <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream/50">
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Appointment ID</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Doctor</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Department</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Date</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Time</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Type</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {filteredAppointments.map((apt) => (
                <tr key={apt.id} className="transition-colors hover:bg-teal-pale/30">
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{apt.id}</td>
                  <td className="px-5 py-4 font-semibold text-ink">{apt.patient}</td>
                  <td className="px-5 py-4 text-ink-soft">{apt.doctor}</td>
                  <td className="px-5 py-4 text-ink-soft">{apt.dept}</td>
                  <td className="px-5 py-4 text-ink-soft">{apt.date}</td>
                  <td className="px-5 py-4 text-ink-soft">{apt.time}</td>
                  <td className="px-5 py-4 text-ink-soft">{apt.type}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={apt.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg p-2 hover:bg-teal-pale transition-colors" title="View">
                        <Eye className="size-4 text-teal-mid" />
                      </button>
                      <button className="rounded-lg p-2 hover:bg-teal-pale transition-colors" title="Edit">
                        <Edit className="size-4 text-ink-soft" />
                      </button>
                      <button className="rounded-lg p-2 hover:bg-coral-pale transition-colors" title="Cancel">
                        <Trash2 className="size-4 text-coral-dark" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
