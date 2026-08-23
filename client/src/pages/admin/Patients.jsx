import { useState } from "react";
import { Search, Plus, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockPatients = [
  { id: "PAT-1024", name: "Raj Sharma", age: 28, gender: "Male", phone: "98XXXXXXXX", lastVisit: "Today", status: "Active" },
  { id: "PAT-1025", name: "Sita Thapa", age: 34, gender: "Female", phone: "97XXXXXXXX", lastVisit: "Yesterday", status: "Active" },
  { id: "PAT-1026", name: "Hari Gurung", age: 45, gender: "Male", phone: "96XXXXXXXX", lastVisit: "Today", status: "Inactive" },
  { id: "PAT-1027", name: "Maya Rai", age: 31, gender: "Female", phone: "95XXXXXXXX", lastVisit: "2 days ago", status: "Active" },
  { id: "PAT-1028", name: "Krishna Shah", age: 52, gender: "Male", phone: "94XXXXXXXX", lastVisit: "Today", status: "Active" },
];

export default function PatientsPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <Header title="Patients" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Patients</h2>
          <p className="text-sm text-muted-foreground">Manage registered patients and medical records.</p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          Register Patient
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Age</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Gender</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Visit</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockPatients.map((patient) => (
              <tr key={patient.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{patient.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{patient.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{patient.age}</td>
                <td className="px-4 py-3 text-muted-foreground">{patient.gender}</td>
                <td className="px-4 py-3 text-muted-foreground">{patient.phone}</td>
                <td className="px-4 py-3 text-muted-foreground">{patient.lastVisit}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={patient.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button className="rounded p-1.5 hover:bg-muted" title="View">
                      <Eye className="size-4 text-muted-foreground" />
                    </button>
                    <button className="rounded p-1.5 hover:bg-muted" title="Edit">
                      <Edit className="size-4 text-muted-foreground" />
                    </button>
                    <button className="rounded p-1.5 hover:bg-muted" title="Delete">
                      <Trash2 className="size-4 text-destructive" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
