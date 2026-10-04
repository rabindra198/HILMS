import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  FileText,
  FlaskConical,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import { ConsultationEditor } from "./components/ConsultationEditor";
import { PrescriptionBuilder } from "./components/PrescriptionBuilder";
import { LabOrderDialog } from "./components/LabOrderDialog";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorTrustNote,
  StatusBadge,
  FIELD_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  CHIP_BUTTON,
  CHIP_PRIMARY,
  formatDate,
  formatDateTime,
  humanise,
} from "./doctorUi";

/**
 * Consultations (FR-DR-02) and the visit workspace (FR-DR-03 .. FR-DR-08).
 *
 * The workspace is the junction of the whole module: notes, vitals, prescription,
 * laboratory orders and the follow-up all hang off one consultation, so the
 * linked counts on each row are read from the server rather than counted in the
 * browser - a locally counted list can only ever reflect what was already loaded.
 */

const filters = [
  { value: "", label: "All" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-3 border-b border-deept/8 py-2 last:border-0">
      <p className="w-40 shrink-0 text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink">{value}</p>
    </div>
  );
}

function VitalsSummary({ vitals }) {
  if (!vitals || !Object.keys(vitals).length) {
    return <p className="text-sm text-ink-soft">No vitals recorded.</p>;
  }
  const readings = [];
  if (vitals.bloodPressureSystolic && vitals.bloodPressureDiastolic) {
    readings.push(["BP", `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic} mmHg`]);
  }
  if (vitals.heartRate) readings.push(["Heart rate", `${vitals.heartRate} bpm`]);
  if (vitals.temperature) readings.push(["Temperature", `${vitals.temperature} °C`]);
  if (vitals.respiratoryRate) readings.push(["Respiratory", `${vitals.respiratoryRate} /min`]);
  if (vitals.spo2) readings.push(["SpO₂", `${vitals.spo2} %`]);
  if (vitals.weight) readings.push(["Weight", `${vitals.weight} kg`]);
  if (vitals.height) readings.push(["Height", `${vitals.height} cm`]);

  if (!readings.length) return <p className="text-sm text-ink-soft">No vitals recorded.</p>;

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {readings.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-teal-pale/60 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</p>
            <p className="text-sm font-bold text-teal-deep">{value}</p>
          </div>
        ))}
      </div>
      {vitals.notes && <p className="mt-2 text-xs text-ink-soft">{vitals.notes}</p>}
    </>
  );
}

export default function DoctorConsultations() {
  const [params, setParams] = useSearchParams();
  const [consultations, setConsultations] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(params.get("status") || "");
  const [search, setSearch] = useState("");
  const [patientFilter, setPatientFilter] = useState(params.get("patient") || "");

  const [openId, setOpenId] = useState(params.get("consultation") || "");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editor, setEditor] = useState({ open: false, consultation: null, appointment: null, patient: null });
  const [rxOpen, setRxOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorApi.getConsultations({
        limit: 100,
        ...(status ? { status } : {}),
        ...(patientFilter ? { patient: patientFilter } : {}),
        ...(search.trim().length >= 2 ? { search: search.trim() } : {}),
      });
      setConsultations(result.items);
      setPagination(result.pagination);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [status, patientFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      setDetail(await doctorApi.getConsultation(id));
    } catch (loadError) {
      setDetail(null);
      toast.error(getDoctorApiError(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDetail(openId);
  }, [openId, loadDetail]);

  const refreshAll = async () => {
    await load();
    await loadDetail(openId);
  };

  /**
   * Starting a visit from an appointment preselects both, so the editor does not
   * ask for the patient the doctor just clicked through from.
   */
  const startFromAppointment = async (appointmentId, patientId) => {
    try {
      const appointment = await doctorApi.getAppointment(appointmentId);
      setEditor({ open: true, consultation: null, appointment, patient: appointment.patient || { _id: patientId } });
    } catch (loadError) {
      toast.error(getDoctorApiError(loadError));
    }
  };

  // Deep link from Appointments / the dashboard.
  useEffect(() => {
    const appointmentId = params.get("appointment");
    const patientId = params.get("patient");
    if (!appointmentId) return;
    startFromAppointment(appointmentId, patientId);
    // Clear the query so a refresh does not silently re-open a new visit.
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DoctorPageShell
      title="Consultations"
      description="Every encounter you have recorded, and the full visit workspace."
      actions={
        <>
          <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Link to="/doctor/appointments" className={CHIP_PRIMARY}>
            <Plus className="size-4" /> Start from an appointment
          </Link>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <DoctorCard
          title="Encounter list"
          description={loading ? "Loading consultations..." : pagination ? `${pagination.total} recorded` : `${consultations.length} shown`}
        >
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by patient or diagnosis..."
                aria-label="Search consultations"
                className={`${FIELD_CLASS} pl-9`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((option) => (
                <button
                  key={option.value || "all"}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={
                    status === option.value
                      ? "rounded-full bg-teal-deep px-3 py-1.5 text-xs font-bold text-white"
                      : "rounded-full border border-deept/15 bg-white px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
                  }
                >
                  {option.label}
                </button>
              ))}
              {patientFilter && (
                <button type="button" onClick={() => setPatientFilter("")} className="rounded-full bg-teal-mid/15 px-3 py-1.5 text-xs font-bold text-teal-mid">
                  This patient ×
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
            {loading && <p className="py-8 text-center text-sm text-ink-soft">Loading...</p>}
            {error && <p className="rounded-xl border border-coral/30 bg-coral-pale px-3 py-2 text-sm text-coral-dark">{error}</p>}
            {!loading && !error && !consultations.length && (
              <p className="rounded-xl border border-dashed border-deept/20 px-4 py-10 text-center text-sm text-ink-soft">
                No consultations match. Start one from a booked appointment.
              </p>
            )}
            {consultations.map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => setOpenId(item._id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  openId === item._id ? "border-teal-mid bg-teal-pale" : "border-deept/10 bg-white hover:bg-teal-pale/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{item.patient?.name || "Patient"}</p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-0.5 truncate text-sm text-ink-soft">{item.diagnosis || item.chiefComplaint || "No diagnosis yet"}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
                  <span className="font-mono font-bold text-teal-mid">{item.consultationNo}</span>
                  <span>{formatDateTime(item.createdAt)}</span>
                  {(item.prescriptions?.length || 0) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Pill className="size-3" /> {item.prescriptions.length} Rx
                    </span>
                  )}
                  {(item.labRequests?.length || 0) > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <FlaskConical className="size-3" /> {item.labRequests.length} lab
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </DoctorCard>

        <div className="space-y-6">
          {!openId ? (
            <DoctorCard>
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Stethoscope className="size-12 text-deept/20" />
                <p className="font-heading text-lg font-bold text-teal-deep">Choose a consultation</p>
                <p className="max-w-xs text-sm text-ink-soft">
                  Open an encounter to read its notes, prescribe, order tests and close the visit.
                </p>
              </div>
            </DoctorCard>
          ) : detailLoading ? (
            <DoctorCard>
              <div className="space-y-4 py-4">
                <div className="h-12 w-56 animate-pulse rounded-xl bg-deept/5" />
                <div className="h-40 w-full animate-pulse rounded-xl bg-deept/5" />
                <div className="h-56 w-full animate-pulse rounded-xl bg-deept/5" />
              </div>
            </DoctorCard>
          ) : detail ? (
            <>
              <DoctorCard
                title={`Consultation ${detail.consultationNo || ""}`}
                description={
                  <>
                    {detail.patient?.name} · {formatDateTime(detail.createdAt)}
                    {detail.appointmentNo ? ` · ${detail.appointmentNo}` : ""}
                  </>
                }
                action={<StatusBadge status={detail.status} />}
              >
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        open: true,
                        consultation: detail,
                        appointment: null,
                        patient: detail.patient,
                      })
                    }
                    className={PRIMARY_BUTTON}
                  >
                    <Stethoscope className="size-4" />
                    {detail.status === "COMPLETED" ? "View / amend" : "Open notes"}
                  </button>

                  {detail.patient && (
                    <button type="button" onClick={() => setRxOpen(true)} className={SECONDARY_BUTTON}>
                      <Pill className="size-4" /> Prescribe
                    </button>
                  )}
                  {detail.patient && (
                    <button type="button" onClick={() => setLabOpen(true)} className={SECONDARY_BUTTON}>
                      <FlaskConical className="size-4" /> Order test
                    </button>
                  )}
                  {detail.patient && (
                    <Link to={`/doctor/patients?patient=${detail.patient._id || detail.patient.id}`} className={SECONDARY_BUTTON}>
                      Patient record
                    </Link>
                  )}
                </div>
              </DoctorCard>

              <DoctorCard title="Clinical record">
                <DetailRow label="Chief complaint" value={detail.chiefComplaint} />
                <DetailRow label="Symptoms" value={detail.symptoms} />
                <DetailRow label="Diagnosis" value={detail.diagnosis} />
                <DetailRow label="Treatment plan" value={detail.treatmentPlan} />
                <DetailRow label="Clinical notes" value={detail.clinicalNotes} />
                <DetailRow label="Treatment outcome" value={detail.treatmentOutcome} />
              </DoctorCard>

              <DoctorCard title="Vitals">
                <VitalsSummary vitals={detail.vitals} />
              </DoctorCard>

              {(detail.prescriptions?.length || 0) > 0 && (
                <DoctorCard title="Prescriptions" description={`${detail.prescriptions.length} issued from this visit`}>
                  <ul className="space-y-2">
                    {detail.prescriptions.map((rx) => (
                      <li key={rx._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-deept/10 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-teal-mid">{rx.prescriptionNo}</p>
                          <p className="text-sm text-ink">
                            {(rx.items || []).map((item) => item.medicine).filter(Boolean).join(", ") || "No medicines recorded"}
                          </p>
                          <p className="text-xs text-ink-soft">{formatDate(rx.issuedAt)}</p>
                        </div>
                        <Link to={`/doctor/prescriptions?prescription=${rx._id}`} className={CHIP_BUTTON}>
                          <FileText className="size-3.5" /> Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                </DoctorCard>
              )}

              {(detail.labRequests?.length || 0) > 0 && (
                <DoctorCard title="Laboratory orders" description={`${detail.labRequests.length} test(s) from this visit`}>
                  <ul className="space-y-2">
                    {detail.labRequests.map((lab) => (
                      <li key={lab._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-deept/10 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink">{lab.test?.name || "Laboratory test"}</p>
                          <p className="text-xs text-ink-soft">
                            {humanise(lab.priority)} · requested {formatDate(lab.requestedDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={lab.status} />
                          {lab.report && (
                            <Link to={`/doctor/laboratory-reports?report=${lab.report}`} className={CHIP_BUTTON}>
                              Review report
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </DoctorCard>
              )}

              {detail.patient?.allergies && (
                <div className="rounded-2xl border-2 border-coral/40 bg-coral-pale px-4 py-3">
                  <p className="text-sm font-extrabold text-coral-dark">Allergies: {detail.patient.allergies}</p>
                </div>
              )}

              <Link
                to={`/doctor/appointments?patient=${detail.patient?._id || detail.patient?.id}`}
                className={`${CHIP_BUTTON} self-start`}
              >
                <CalendarPlus className="size-3.5" /> Book a follow-up for this patient
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <ConsultationEditor
        open={editor.open}
        consultation={editor.consultation}
        appointment={editor.appointment}
        patient={editor.patient}
        onClose={() => setEditor((current) => ({ ...current, open: false }))}
        onSaved={refreshAll}
      />

      {detail?.patient && (
        <>
          <PrescriptionBuilder
            open={rxOpen}
            patientId={detail.patient._id || detail.patient.id}
            consultationId={detail._id}
            onClose={() => setRxOpen(false)}
            onSaved={refreshAll}
          />
          <LabOrderDialog
            open={labOpen}
            patientId={detail.patient._id || detail.patient.id}
            appointmentId={detail.appointment?._id}
            consultationId={detail._id}
            onClose={() => setLabOpen(false)}
            onSaved={refreshAll}
          />
        </>
      )}

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
