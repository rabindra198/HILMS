import { useEffect, useState } from "react";
import { UserCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DoctorProfile() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    specialization: "",
    licenseNumber: "",
    department: "",
    workingStart: "09:00",
    workingEnd: "17:00",
    bio: "",
  });

  useEffect(() => {
    doctorApi
      .getProfile()
      .then((d) => {
        setData(d);
        setForm({
          name: d.user?.name || "",
          email: d.user?.email || "",
          phone: d.user?.phone || "",
          specialization: d.profile?.specialization || "",
          licenseNumber: d.profile?.licenseNumber || "",
          department: d.profile?.department || "",
          workingStart: d.profile?.workingHours?.start || "09:00",
          workingEnd: d.profile?.workingHours?.end || "17:00",
          bio: d.profile?.bio || "",
        });
        setLoading(false);
      })
      .catch(() => {
        const fb = fallbackDoctorData.profile;
        setData(fb);
        setForm({
          name: fb.user?.name || "",
          email: fb.user?.email || "",
          phone: fb.user?.phone || "",
          specialization: fb.profile?.specialization || "",
          licenseNumber: fb.profile?.licenseNumber || "",
          department: fb.profile?.department || "",
          workingStart: fb.profile?.workingHours?.start || "09:00",
          workingEnd: fb.profile?.workingHours?.end || "17:00",
        });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await doctorApi.updateProfile({
        name: form.name,
        phone: form.phone,
        specialization: form.specialization,
        licenseNumber: form.licenseNumber,
        department: form.department,
        workingHours: { start: form.workingStart, end: form.workingEnd },
        bio: form.bio,
      });
      toast.success("Profile updated successfully");
    } catch (e) {
      toast.error("Unable to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-teal-deep">Profile</h1>
        <p className="mt-1 text-sm text-ink-soft font-medium">Manage your professional information.</p>
      </div>

      <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-cream" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-cream" />
              <div className="h-4 w-32 animate-pulse rounded bg-cream" />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-teal-pale text-teal-mid">
            <UserCircle className="size-9" />
          </div>
          <div>
            <p className="font-heading text-lg font-bold text-ink">{form.name}</p>
            <p className="text-sm text-ink-soft">{form.specialization} — {form.department}</p>
            <span className="inline-flex items-center rounded-full bg-teal-pale px-2.5 py-0.5 text-xs font-medium text-teal-mid mt-1">Doctor</span>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Full Name</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <Input value={form.email} readOnly className="bg-cream/50" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Phone</label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Specialization</label>
            <Input value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">License Number</label>
            <Input value={form.licenseNumber} onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Department</label>
            <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Working Hours Start</label>
            <Input type="time" value={form.workingStart} onChange={(e) => setForm((f) => ({ ...f, workingStart: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Working Hours End</label>
            <Input type="time" value={form.workingEnd} onChange={(e) => setForm((f) => ({ ...f, workingEnd: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-ink">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Short professional bio"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
