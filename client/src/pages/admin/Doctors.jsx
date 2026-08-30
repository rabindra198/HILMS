import { useState } from "react";
import { Search, Plus, Eye, Calendar, Clock, Stethoscope, Users, CalendarCheck } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";

const mockDoctors = [
  { id: "DOC-001", name: "Dr. Adhikari", dept: "Cardiology", spec: "Cardiologist", availability: "Mon-Fri", hours: "9AM - 5PM", fee: "Rs. 1,500", status: "Available", patients: 24 },
  { id: "DOC-002", name: "Dr. Shah", dept: "Neurology", spec: "Neurologist", availability: "Mon-Thu", hours: "10AM - 4PM", fee: "Rs. 2,000", status: "Available", patients: 18 },
  { id: "DOC-003", name: "Dr. Thapa", dept: "Pediatrics", spec: "Pediatrician", availability: "Tue-Sat", hours: "9AM - 3PM", fee: "Rs. 1,200", status: "On Leave", patients: 0 },
  { id: "DOC-004", name: "Dr. Gurung", dept: "General Medicine", spec: "General Physician", availability: "Mon-Sat", hours: "8AM - 2PM", fee: "Rs. 1,000", status: "Available", patients: 32 },
  { id: "DOC-005", name: "Dr. KC", dept: "Dermatology", spec: "Dermatologist", availability: "Mon-Fri", hours: "11AM - 6PM", fee: "Rs. 1,800", status: "Available", patients: 15 },
  { id: "DOC-006", name: "Dr. Rai", dept: "Orthopedics", spec: "Orthopedic Surgeon", availability: "Wed-Sun", hours: "10AM - 4PM", fee: "Rs. 2,500", status: "On Leave", patients: 0 },
];

export default function DoctorsPage() {
  const [search, setSearch] = useState("");

  const filteredDoctors = mockDoctors.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.dept.toLowerCase().includes(search.toLowerCase()) ||
      d.spec.toLowerCase().includes(search.toLowerCase())
  );

  const availableCount = mockDoctors.filter((d) => d.status === "Available").length;
  const onLeaveCount = mockDoctors.filter((d) => d.status === "On Leave").length;
  const totalPatients = mockDoctors.reduce((sum, d) => sum + d.patients, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Doctor Availability
          </h1>
          <p className="text-base text-ink-soft font-medium">
            View available doctors and manage appointment slots.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
          <Plus className="size-4" />
          Add Doctor
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-deept/5 bg-teal-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-mid/15">
              <Stethoscope className="size-5 text-teal-mid" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Available Doctors</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">{availableCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-coral-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-coral/20">
              <Calendar className="size-5 text-coral-dark" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">On Leave</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">{onLeaveCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-lavender-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender/30">
              <Users className="size-5 text-lavender" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Total Patients Today</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">{totalPatients}</p>
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
            placeholder="Search by name, department, or specialization..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
          />
        </div>
        <span className="text-sm font-medium text-ink-soft">
          {filteredDoctors.length} doctors found
        </span>
      </div>

      {/* Doctors Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredDoctors.map((doctor) => (
          <div key={doctor.id} className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-coral to-lavender">
                  <span className="font-heading text-lg font-bold text-white">
                    {doctor.name.split(" ")[1]?.[0] || doctor.name[0]}
                  </span>
                </div>
                <div>
                  <h3 className="font-heading text-base font-bold text-teal-deep">{doctor.name}</h3>
                  <p className="text-sm text-ink-soft">{doctor.dept}</p>
                </div>
              </div>
              <StatusBadge status={doctor.status} />
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  <Stethoscope className="size-3.5" />
                  Specialization
                </span>
                <span className="text-sm font-semibold text-ink">{doctor.spec}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  <CalendarCheck className="size-3.5" />
                  Availability
                </span>
                <span className="text-sm font-semibold text-ink">{doctor.availability}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  <Clock className="size-3.5" />
                  Working Hours
                </span>
                <span className="text-sm font-semibold text-ink">{doctor.hours}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  <Users className="size-3.5" />
                  Patients Today
                </span>
                <span className="text-sm font-semibold text-ink">{doctor.patients}</span>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border-2 border-deept/15 bg-white px-4 py-2 text-sm font-semibold text-teal-deep hover:bg-teal-pale hover:border-teal-pale transition-all">
                <Eye className="size-3.5" />
                View
              </button>
              <button className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white shadow-md shadow-coral/20 hover:bg-coral-dark transition-all">
                <Calendar className="size-3.5" />
                Schedule
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
