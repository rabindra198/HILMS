import { Users, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockPatients = [
  { id: "PAT-1024", name: "Raj Sharma", age: 28, gender: "Male", phone: "98XXXXXXXX", lastVisit: "Today", status: "Active" },
  { id: "PAT-1025", name: "Sita Thapa", age: 34, gender: "Female", phone: "97XXXXXXXX", lastVisit: "Yesterday", status: "Active" },
  { id: "PAT-1026", name: "Hari Gurung", age: 45, gender: "Male", phone: "96XXXXXXXX", lastVisit: "Today", status: "Inactive" },
];

export default function DoctorPatients() {
  return (
    <div className="space-y-6">
      <Header title="Patients" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">My Patients</h2>
          <p className="text-sm text-muted-foreground">View and manage your assigned patients.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search patients..." className="pl-9" />
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
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Visit</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockPatients.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-muted/50">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.age}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.gender}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.lastVisit}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3">
                  <button className="text-sm font-medium text-primary hover:underline">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
