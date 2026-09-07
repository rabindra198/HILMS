import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, CheckCircle2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { doctorApi } from "@/services/doctorApi";
import { fallbackConsultationDetail, fallbackDoctorData } from "@/services/doctorFallback";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { PrescriptionForm } from "@/components/doctor/PrescriptionForm";
import { LabRequestForm } from "@/components/doctor/LabRequestForm";
import { FollowUpForm } from "@/components/doctor/FollowUpForm";
import { useAuth } from "@/context/AuthContext";

const tabs = ["Overview", "Medical History", "Prescriptions", "Lab Reports", "Previous Consultations"];

export default function DoctorConsultation() {
  const { user } = useAuth();
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    chiefComplaint: "",
    clinicalNotes: "",
    diagnosis: "",
    treatmentPlan: "",
    additionalNotes: "",
    vitalSigns: { bloodPressure: "", heartRate: "", temperature: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "" },
  });

  useEffect(() => {
    const appointment = (fallbackDoctorData.dashboard.appointments || []).find(
      (a) => String(a.id) === String(appointmentId)
    );

    const detail = {
      ...fallbackConsultationDetail,
      patient: appointment?.patient || fallbackConsultationDetail.patient,
    };

    setData(detail);
    setForm((f) => ({
      ...f,
      vitalSigns: detail.consultation.vitalSigns || f.vitalSigns,
      chiefComplaint: detail.consultation.chiefComplaint || "",
    }));

    doctorApi
      .getConsultationByAppointment(appointmentId)
      .then((res) => {
        setData(res);
        if (res.consultation) {
          setForm((f) => ({
            ...f,
            chiefComplaint: res.consultation.chiefComplaint || "",
            clinicalNotes: res.consultation.clinicalNotes || "",
            diagnosis: res.consultation.diagnosis || "",
            treatmentPlan: res.consultation.treatmentPlan || "",
            additionalNotes: res.consultation.additionalNotes || "",
            vitalSigns: res.consultation.vitalSigns || f.vitalSigns,
          }));
        }
      })
      .catch(() => {});
  }, [appointmentId]);

  const setVital = (key, value) => {
    setForm((f) => ({ ...f, vitalSigns: { ...f.vitalSigns, [key]: value } }));
  };

  const handleSave = async (status = "Draft") => {
    setSaving(true);
    try {
      await doctorApi.saveConsultation(
        {
          appointment: appointmentId,
          patient: data?.patient?.id,
          chiefComplaint: form.chiefComplaint,
          clinicalNotes: form.clinicalNotes,
          diagnosis: form.diagnosis,
          treatmentPlan: form.treatmentPlan,
          additionalNotes: form.additionalNotes,
          vitalSigns: form.vitalSigns,
          status,
        },
        data?.consultation?.id
      );
      toast.success(status === "Completed" ? "Consultation completed successfully" : "Consultation saved successfully");
      if (status === "Completed") navigate("/doctor/dashboard");
    } catch (e) {
      toast.error(status === "Completed" ? "Unable to complete consultation. Please try again." : "Unable to save consultation. Please try again.");
      if (status === "Completed") navigate("/doctor/dashboard");
    } finally {
      setSaving(false);
    }
  };

  const patient = data?.patient || {};
  const vital = form.vitalSigns || {};

  const vitalFields = [
    { key: "bloodPressure", label: "Blood Pressure", unit: "mmHg", placeholder: "120/80" },
    { key: "heartRate", label: "Heart Rate", unit: "bpm", placeholder: "72" },
    { key: "temperature", label: "Temperature", unit: "°C", placeholder: "36.8" },
    { key: "respiratoryRate", label: "Respiratory Rate", unit: "/min", placeholder: "16" },
    { key: "oxygenSaturation", label: "Oxygen Saturation", unit: "%", placeholder: "98" },
    { key: "weight", label: "Weight", unit: "kg", placeholder: "74" },
    { key: "height", label: "Height", unit: "cm", placeholder: "172" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleSave("Draft")} disabled={saving}>
            <Save className="size-4" /> {saving ? "Saving..." : "Save Consultation"}
          </Button>
          <Button variant="secondary" onClick={() => handleSave("Completed")}>
            <CheckCircle2 className="size-4" /> Complete
          </Button>
        </div>
      </div>

      {/* Patient Information */}
      <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-teal-deep mb-4">Patient Information</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Patient Name" value={patient.name} />
          <Info label="Patient ID" value={patient.patientId || "—"} />
          <Info label="Age" value={patient.age} />
          <Info label="Gender" value={patient.gender} />
          <Info label="Blood Group" value={patient.bloodGroup || "—"} />
          <Info label="Phone" value={patient.phone || "—"} />
          <Info label="Allergies" value={(patient.allergies || []).join(", ") || "None"} highlight={(patient.allergies || []).length > 0} />
          <Info label="Conditions" value={(patient.conditions || []).join(", ") || "None"} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === t ? "bg-teal-mid text-white shadow-sm" : "bg-cream text-ink-soft hover:bg-teal-pale"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h3 className="font-heading text-lg font-bold text-teal-deep mb-4">Vital Signs</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {vitalFields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">{field.label} ({field.unit})</label>
                  <input
                    value={vital[field.key] ?? ""}
                    onChange={(e) => setVital(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
            <h3 className="font-heading text-lg font-bold text-teal-deep mb-4">Consultation</h3>
            <div className="flex flex-col gap-4">
              <Field label="Chief Complaint" value={form.chiefComplaint} onChange={(v) => setForm((f) => ({ ...f, chiefComplaint: v }))} textarea rows={2} />
              <Field label="Clinical Notes" value={form.clinicalNotes} onChange={(v) => setForm((f) => ({ ...f, clinicalNotes: v }))} textarea rows={3} />
              <Field label="Diagnosis" value={form.diagnosis} onChange={(v) => setForm((f) => ({ ...f, diagnosis: v }))} textarea rows={2} />
              <Field label="Treatment Plan" value={form.treatmentPlan} onChange={(v) => setForm((f) => ({ ...f, treatmentPlan: v }))} textarea rows={2} />
              <Field label="Additional Notes" value={form.additionalNotes} onChange={(v) => setForm((f) => ({ ...f, additionalNotes: v }))} textarea rows={2} />
            </div>
          </div>
        </div>
      )}

      {activeTab === "Medical History" && (
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <h3 className="font-heading text-lg font-bold text-teal-deep mb-4">Medical History</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info label="Allergies" value={(patient.allergies || []).join(", ") || "None"} highlight={(patient.allergies || []).length > 0} />
            <Info label="Existing Conditions" value={(patient.conditions || []).join(", ") || "None"} />
          </div>
          <div className="mt-6">
            <p className="text-sm font-semibold text-ink mb-3">Previous Diagnoses</p>
            <div className="flex flex-col divide-y divide-deept/5">
              {(data?.medicalHistory || []).map((h) => (
                <div key={h.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-ink">{h.diagnosis || "—"}</p>
                    <StatusBadge status={h.status} />
                  </div>
                  <p className="text-xs text-ink-soft mt-1">{h.createdAt} — {h.clinicalNotes}</p>
                </div>
              ))}
              {(data?.medicalHistory || []).length === 0 && (
                <p className="py-4 text-sm text-ink-soft">No previous medical history found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Prescriptions" && (
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold text-teal-deep">Prescriptions</h3>
            <PrescriptionForm
              patient={patient}
              defaultDiagnosis={form.diagnosis}
              consultationId={data?.consultation?.id}
              doctorName={user?.name || data?.consultation?.doctor?.user?.name}
              licenseNumber={data?.consultation?.doctor?.licenseNumber}
              onSaved={() => {
                doctorApi.getConsultation(appointmentId).then(setData).catch(() => {});
              }}
            />
          </div>
          <div className="flex flex-col divide-y divide-deept/5">
            {(data?.prescriptions || []).map((rx) => (
              <div key={rx.id} className="py-3">
                <p className="font-medium text-ink">{rx.diagnosis || "—"}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(rx.medicines || []).map((m, i) => (
                    <span key={i} className="rounded-full bg-cream px-2.5 py-1 text-xs text-ink">
                      {m.name} • {m.dosage} • {m.frequency} • {m.duration}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {(data?.prescriptions || []).length === 0 && (
              <p className="py-4 text-sm text-ink-soft">No prescriptions yet.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "Lab Reports" && (
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold text-teal-deep">Laboratory Reports</h3>
            <LabRequestForm patient={patient} appointmentId={appointmentId} />
          </div>
          <div className="flex flex-col divide-y divide-deept/5">
            {(data?.labReports || []).map((r) => (
              <div key={r.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{r.testName}</p>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(r.results || []).map((res, i) => (
                    <span key={i} className="rounded-lg border border-deept/10 px-2.5 py-1 text-xs text-ink">
                      {res.test}: <span className="font-semibold">{res.result}</span>
                      {res.flag === "high" && <span className="ml-1 text-coral-dark">▲</span>}
                      {res.flag === "low" && <span className="ml-1 text-coral-dark">▼</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {(data?.labReports || []).length === 0 && (
              <p className="py-4 text-sm text-ink-soft">No laboratory reports yet.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "Previous Consultations" && (
        <div className="rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
          <h3 className="font-heading text-lg font-bold text-teal-deep mb-4">Previous Consultations</h3>
          <div className="flex flex-col divide-y divide-deept/5">
            {(data?.medicalHistory || []).map((h) => (
              <div key={h.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink">{h.diagnosis || "—"}</p>
                  <span className="text-xs text-ink-soft">{h.createdAt}</span>
                </div>
                <p className="text-xs text-ink-soft mt-1">{h.clinicalNotes}</p>
              </div>
            ))}
            {(data?.medicalHistory || []).length === 0 && (
              <p className="py-4 text-sm text-ink-soft">No previous consultations found.</p>
            )}
          </div>
        </div>
      )}

      {/* Follow-up */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-deept/10 bg-white p-6 shadow-sm">
        <ClipboardCheck className="size-5 text-teal-mid" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">Continue treatment in a follow-up visit?</p>
          <p className="text-xs text-ink-soft">Schedule a check-up after this consultation.</p>
        </div>
        <FollowUpForm patient={patient} consultationId={data?.consultation?.id} />
      </div>
    </div>
  );
}

function Info({ label, value, highlight }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${highlight ? "text-coral-dark" : "text-ink"}`}>{value || "—"}</p>
    </div>
  );
}

function Field({ label, value, onChange, textarea, rows = 2 }) {
  const cls = "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}
