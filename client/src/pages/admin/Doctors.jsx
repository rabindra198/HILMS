import { Search, Plus, Eye, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockDoctors = [
  { id: "DOC-001", name: "Dr. Adhikari", dept: "Cardiology", spec: "Cardiologist", availability: "Mon-Fri", hours: "9AM - 5PM", fee: "Rs. 1,500", status: "Available" },
  { id: "DOC-002", name: "Dr. Shah", dept: "Neurology", spec: "Neurologist", availability: "Mon-Thu", hours: "10AM - 4PM", fee: "Rs. 2,000", status: "Available" },
  { id: "DOC-003", name: "Dr. Thapa", dept: "Pediatrics", spec: "Pediatrician", availability: "Tue-Sat", hours: "9AM - 3PM", fee: "Rs. 1,200", status: "On Leave" },
];

export default function DoctorsPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <Header title="Doctor Availability" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Doctor Availability</h2>
          <p className="text-sm text-muted-foreground">View available doctors and manage appointment slots.</p>
        </div>
        <Button>
          <Plus className="mr-2 size-4" />
          Add Doctor
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search doctors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockDoctors.map((doctor) => (
          <div key={doctor.id} className="rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{doctor.name}</h3>
                <p className="text-sm text-muted-foreground">{doctor.dept}</p>
              </div>
              <StatusBadge status={doctor.status} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Specialization</span>
                <span className="font-medium text-foreground">{doctor.spec}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Availability</span>
                <span className="font-medium text-foreground">{doctor.availability}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Working Hours</span>
                <span className="font-medium text-foreground">{doctor.hours}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consultation Fee</span>
                <span className="font-medium text-foreground">{doctor.fee}</span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">
                <Eye className="mr-2 size-3" />
                View
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                <Calendar className="mr-2 size-3" />
                Schedule
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
