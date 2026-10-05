import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarPlus,
  ClipboardList,
  Droplet,
  Phone,
  RefreshCw,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorTrustNote,
  StatusBadge,
  FIELD_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  CHIP_BUTTON,
  formatDate,
  formatDateTime,
  humanise,
  ageFromDateOfBirth,
} from "./doctorUi";

/**
 * Patient workspace (FR-DR-02).
 *
 * The list is the doctor's care team; the detail pane is the longitudinal
 * record. Both come back already scoped - opening a patient id the doctor is not
 * assigned to returns 404, so the detail pane treats that as "not available"
 * rather than surfacing an empty chart that looks like the patient has no history.
 */

const EVENT_TONES = {
  APPOINTMENT: "bg-teal-mid/15 text-teal-deep",
  CONSULTATION: "bg-lavender/30 text-teal-deep",
  PRESCRIPTION: "bg-teal-pale text-teal-deep",
  LAB_REQUEST: "bg-teal-mid/20 text-teal-mid",
  LAB_REPORT: "bg-teal-mid/20 text-teal-deep",
  SAMPLE_COLLECTION: "bg-lavender/30 text-teal-deep",
  PAYMENT: "bg-teal-pale text-teal-deep",
};

const EVENT_TYPES = ["ALL", "CONSULTATION", "APPOINTMENT", "PRESCRIPTION", "LAB_REQUEST", "SAMPLE_COLLECTION", "LAB_REPORT", "PAYMENT"];

function SummaryTile({ label, value, hint, to }) {
  const body = (
    <>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1.5 font-heading text-2xl font-extrabold text-teal-deep">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-soft">{hint}</p>}
    </>
  );

  return to ? (
    <Link to={to} className="block rounded-2xl border-2 border-deept/10 bg-white p-4 no-underline hover:shadow-md">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border-2 border-deept/10 bg-white p-4">{body}</div>
  );
}

function PatientHeader({ patient }) {
  const age = patient.age ?? ageFromDateOfBirth(patient.dateOfBirth);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-teal-pale text-teal-deep">
            <UserRound className="size-7" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-extrabold text-teal-deep">{patient.name}</h2>
            <p className="font-mono text-xs font-bold text-teal-mid">{patient.reference}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {[age != null ? `${age} yrs` : null, humanise(patient.gender)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/doctor/consultations?patient=${patient.id}&new=1`} className={PRIMARY_BUTTON}>
            <Stethoscope className="size-4" /> Start consultation
          </Link>
          <Link to={`/doctor/appointments?patient=${patient.id}`} className={SECONDARY_BUTTON}>
            <CalendarPlus className="size-4" /> Book appointment
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <p className="flex items-center gap-2 text-sm text-ink">
          <Droplet className="size-4 shrink-0 text-coral-dark" />
          <span><span className="text-ink-soft">Blood group</span> {patient.bloodGroup || "-"}</span>
        </p>
        <p className="flex items-center gap-2 text-sm text-ink">
          <Phone className="size-4 shrink-0 text-teal-mid" />
          <span className="truncate"><span className="text-ink-soft">Contact</span> {patient.contactNumber || patient.email || "-"}</span>
        </p>
        <p className="flex items-center gap-2 text-sm text-ink">
          <Activity className="size-4 shrink-0 text-teal-mid" />
          <span className="truncate"><span className="text-ink-soft">Emergency</span> {patient.emergencyContact?.name || "-"}</span>
        </p>
        <p className="flex items-center gap-2 text-sm text-ink">
          <ClipboardList className="size-4 shrink-0 text-teal-mid" />
          <span className="truncate"><span className="text-ink-soft">Care team</span> {(patient.careTeam || []).length} clinician(s)</span>
        </p>
      </div>

      {patient.address && <p className="text-sm text-ink-soft">Address: {patient.address}</p>}

      {/* Allergies sit above the fold and cannot be collapsed: missing one here is
          a safety problem, not a layout preference. */}
      {patient.allergies ? (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-coral/40 bg-coral-pale px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-coral-dark" />
          <div>
            <p className="text-sm font-extrabold text-coral-dark">Known allergies</p>
            <p className="text-sm text-coral-dark">{patient.allergies}</p>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-deept/10 bg-teal-pale/50 px-4 py-3 text-sm font-medium text-teal-deep">
          No allergies recorded.
        </p>
      )}
    </div>
  );
}

function Timeline({ events, filter, onFilter }) {
  const visible = filter === "ALL" ? events : events.filter((event) => event.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onFilter(type)}
            className={
              filter === type
                ? "rounded-full bg-teal-deep px-3 py-1.5 text-xs font-bold text-white"
                : "rounded-full border border-deept/15 bg-white px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
            }
          >
            {type === "ALL" ? "All events" : humanise(type)}
          </button>
        ))}
      </div>

      {!visible.length ? (
        <p className="rounded-xl border border-dashed border-deept/20 px-4 py-10 text-center text-sm text-ink-soft">
          No {filter === "ALL" ? "" : humanise(filter).toLowerCase() + " "}events recorded for this patient yet.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-deept/10 pl-6">
          {visible.map((event, index) => (
            <li key={`${event.type}-${event.reportId || event.consultationNo || event.prescriptionNo || event.appointmentNo || index}`} className="relative">
              <span className="absolute -left-[31px] flex size-3.5 items-center justify-center rounded-full border-2 border-white bg-teal-mid" />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${EVENT_TONES[event.type] || "bg-slate-100 text-ink-soft"}`}>
                  {humanise(event.type)}
                </span>
                <span className="text-xs font-semibold text-ink-soft">{formatDateTime(event.at)}</span>
                {event.actor && <span className="text-xs text-ink-soft">· {event.actor}</span>}
                {event.status && <StatusBadge status={event.status} />}
              </div>
              <p className="mt-1.5 text-sm font-bold text-ink">{event.title}</p>
              {event.subtitle && <p className="text-sm text-ink-soft">{event.subtitle}</p>}
              {event.itemCount > 0 && (
                <p className="mt-1 text-xs text-ink-soft">
                  {event.itemCount} medicine(s) ·{" "}
                  <Link to={`/doctor/prescriptions?prescription=${event.prescriptionNo}`} className="font-bold text-teal-mid underline underline-offset-4">
                    open prescription
                  </Link>
                </p>
              )}
              {event.doctorCommentCount > 0 && (
                <p className="mt-1 text-xs text-ink-soft">{event.doctorCommentCount} doctor comment(s) on this report</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function DoctorPatients() {
  const [params] = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState(params.get("patient") || "");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("ALL");

  const loadPatients = useCallback(async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const list = await doctorApi.getPatients(query ? { search: query } : {});
      setPatients(Array.isArray(list) ? list : []);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadPatients(search.trim()), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [loadPatients, search]);

  const loadDetail = useCallback(async (patientId) => {
    if (!patientId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      // The header and the timeline are requested together so the detail pane
      // never shows a demographics card beside a still-empty history.
      const [patient, history] = await Promise.all([
        doctorApi.getPatient(patientId),
        doctorApi.getPatientHistory(patientId, { limit: 50 }),
      ]);
      setDetail({ patient, history });
    } catch (loadError) {
      setDetail(null);
      setDetailError(getDoctorApiError(loadError));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const summary = detail?.patient?.summary || {};
  const events = detail?.history?.events || [];

  return (
    <DoctorPageShell
      title="My Patients"
      description="Everyone on your care team, with their full clinical record."
      actions={
        <button type="button" onClick={() => loadPatients(search.trim())} disabled={loading} className={CHIP_BUTTON}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <DoctorCard
          title="Care team"
          description={loading ? "Loading patients..." : `${patients.length} assigned`}
        >
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email..."
              aria-label="Search patients"
              className={`${FIELD_CLASS} pl-9`}
            />
          </div>

          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {loading && <p className="py-8 text-center text-sm text-ink-soft">Loading...</p>}
            {error && <p className="rounded-xl border border-coral/30 bg-coral-pale px-3 py-2 text-sm text-coral-dark">{error}</p>}
            {!loading && !error && !patients.length && (
              <p className="rounded-xl border border-dashed border-deept/20 px-4 py-10 text-center text-sm text-ink-soft">
                {search ? "No patients match that search." : "No patients are assigned to you yet. An Admin adds you to a patient's care team."}
              </p>
            )}
            {patients.map((patient) => (
              <button
                key={patient._id}
                type="button"
                onClick={() => setSelectedId(patient._id)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                  selectedId === patient._id
                    ? "border-teal-mid bg-teal-pale"
                    : "border-deept/10 bg-white hover:bg-teal-pale/40"
                }`}
              >
                <p className="font-semibold text-ink">{patient.name}</p>
                <p className="truncate text-xs text-ink-soft">{patient.email}</p>
                {patient.contactNumber && <p className="text-xs text-ink-soft">{patient.contactNumber}</p>}
              </button>
            ))}
          </div>
        </DoctorCard>

        <div className="space-y-6">
          {!selectedId ? (
            <DoctorCard>
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <UserRound className="size-12 text-deept/20" />
                <p className="font-heading text-lg font-bold text-teal-deep">Choose a patient</p>
                <p className="max-w-xs text-sm text-ink-soft">
                  Select someone from your care team to review their history, prescriptions and laboratory reports.
                </p>
              </div>
            </DoctorCard>
          ) : detailLoading ? (
            <DoctorCard>
              <div className="space-y-4 py-4">
                <div className="h-16 w-64 animate-pulse rounded-xl bg-deept/5" />
                <div className="h-24 w-full animate-pulse rounded-xl bg-deept/5" />
                <div className="h-64 w-full animate-pulse rounded-xl bg-deept/5" />
              </div>
            </DoctorCard>
          ) : detailError ? (
            <DoctorCard>
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="font-heading text-lg font-bold text-coral-dark">Record unavailable</p>
                <p className="max-w-sm text-sm text-ink-soft">{detailError}</p>
                <button type="button" onClick={() => setSelectedId("")} className={SECONDARY_BUTTON}>
                  Back to list
                </button>
              </div>
            </DoctorCard>
          ) : detail ? (
            <>
              <DoctorCard title="Patient record">
                <PatientHeader patient={detail.patient} />
              </DoctorCard>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile
                  label="Last consultation"
                  value={summary.lastConsultation ? formatDate(summary.lastConsultation.date) : "None"}
                  hint={summary.lastConsultation?.diagnosis || "No consultation recorded"}
                />
                <SummaryTile label="Open prescriptions" value={summary.openPrescriptions ?? 0} hint="Medicines currently prescribed" />
                <SummaryTile label="Verified reports" value={summary.verifiedReports ?? 0} hint="Laboratory reports ready" />
                <SummaryTile
                  label="Upcoming visits"
                  value={summary.upcomingAppointments ?? 0}
                  hint="Booked appointments"
                />
              </div>

              <DoctorCard
                title="Medical history"
                description="Appointments, consultations, prescriptions and laboratory activity in one timeline."
              >
                <Timeline events={events} filter={historyFilter} onFilter={setHistoryFilter} />
              </DoctorCard>

              {/* `summary.openPrescriptions` / `verifiedReports` are COUNTS (countDocuments),
                not arrays, so these are navigation cards driven by the real number.
                The individual records are already listed in the timeline below. */}
              {(summary.openPrescriptions > 0 || summary.verifiedReports > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {summary.openPrescriptions > 0 && (
                    <DoctorCard
                      title="Medicines to review"
                      description={`${summary.openPrescriptions} open prescription(s) for this patient`}
                    >
                      <p className="text-sm text-ink-soft">
                        These medicines are currently issued and are listed with the patient&apos;s history below.
                      </p>
                      <Link to={`/doctor/prescriptions?patient=${detail.patient.id}`} className={`${CHIP_BUTTON} mt-3`}>
                        Open prescriptions
                      </Link>
                    </DoctorCard>
                  )}

                  {summary.verifiedReports > 0 && (
                    <DoctorCard
                      title="Reports to review"
                      description={`${summary.verifiedReports} verified report(s) for this patient`}
                    >
                      <p className="text-sm text-ink-soft">
                        These results have been verified by the laboratory and are ready to be reviewed.
                      </p>
                      <Link to={`/doctor/laboratory-reports?patient=${detail.patient.id}`} className={`${CHIP_BUTTON} mt-3`}>
                        Open reports
                      </Link>
                    </DoctorCard>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
