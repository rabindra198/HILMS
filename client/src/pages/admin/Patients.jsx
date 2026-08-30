import { useState } from "react";
import { Search, Plus, Eye, Edit, Trash2, Users } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";

const mockPatients = [
  { id: "PAT-1024", name: "Raj Sharma", age: 28, gender: "Male", phone: "98XXXXXXXX", lastVisit: "Today", status: "Active" },
  { id: "PAT-1025", name: "Sita Thapa", age: 34, gender: "Female", phone: "97XXXXXXXX", lastVisit: "Yesterday", status: "Active" },
  { id: "PAT-1026", name: "Hari Gurung", age: 45, gender: "Male", phone: "96XXXXXXXX", lastVisit: "Today", status: "Inactive" },
  { id: "PAT-1027", name: "Maya Rai", age: 31, gender: "Female", phone: "95XXXXXXXX", lastVisit: "2 days ago", status: "Active" },
  { id: "PAT-1028", name: "Krishna Shah", age: 52, gender: "Male", phone: "94XXXXXXXX", lastVisit: "Today", status: "Active" },
];

export default function PatientsPage() {
  const [search, setSearch] = useState("");

  const filteredPatients = mockPatients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search)
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Patients
          </h1>
          <p className="text-base text-ink-soft font-medium">
            Manage registered patients and medical records.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
          <Plus className="size-4" />
          Register Patient
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-deept/5 bg-teal-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-mid/15">
              <Users className="size-5 text-teal-mid" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Total Patients</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">1,248</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-lavender-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender/30">
              <Eye className="size-5 text-lavender" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Active Today</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">86</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-coral-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-coral/20">
              <Plus className="size-5 text-coral-dark" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">New This Week</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">24</p>
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
            placeholder="Search by name, ID, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
          />
        </div>
        <span className="text-sm font-medium text-ink-soft">
          {filteredPatients.length} patients found
        </span>
      </div>

      {/* Patients Table */}
      <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream/50">
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient ID</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Age</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Gender</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Phone</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Last Visit</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {filteredPatients.map((patient) => (
                <tr key={patient.id} className="transition-colors hover:bg-teal-pale/30">
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{patient.id}</td>
                  <td className="px-5 py-4 font-semibold text-ink">{patient.name}</td>
                  <td className="px-5 py-4 text-ink-soft">{patient.age}</td>
                  <td className="px-5 py-4 text-ink-soft">{patient.gender}</td>
                  <td className="px-5 py-4 text-ink-soft">{patient.phone}</td>
                  <td className="px-5 py-4 text-ink-soft">{patient.lastVisit}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={patient.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg p-2 hover:bg-teal-pale transition-colors" title="View">
                        <Eye className="size-4 text-teal-mid" />
                      </button>
                      <button className="rounded-lg p-2 hover:bg-teal-pale transition-colors" title="Edit">
                        <Edit className="size-4 text-ink-soft" />
                      </button>
                      <button className="rounded-lg p-2 hover:bg-coral-pale transition-colors" title="Delete">
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
