import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { patientApi, getApiError } from "@/services/patientApi";
import {
  PatientCard,
  PatientPageShell,
  PatientResponsiveList,
  PatientTrustNote,
  StatusBadge,
  CHIP_BUTTON,
  SECONDARY_BUTTON,
  formatDate,
  formatDateTime,
  humanise,
} from "./patientUi";

const TABS = [
  { key: "timeline", label: "Timeline" },
  { key: "consultations", label: "Consultations" },
];

const EVENT_TONE = {
  APPOINTMENT: "bg-lavender-pale text-lavender",
  CONSULTATION: "bg-teal-pale text-teal-mid",
  PRESCRIPTION: "bg-softteal text-teal-mid",
  LAB_REQUEST: "bg-teal-pale text-teal-mid",
  LAB_REPORT: "bg-teal-pale text-teal-mid",
};

/**
 * Medical history (FR-PT-03 / FR-PT-04).
 *
 * The timeline is assembled on the server from the same five collections the
 * doctor's view reads, so it cannot drift from the clinical record. Verified
 * reports are the only reports in it.
 */
export default function PatientMedicalHistory() {
  const [tab, setTab] = useState("timeline");
  const [history, setHistory] = useState({ events: [], counts: {} });
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const [historyData, consultationList] = await Promise.all([
        patientApi.getMedicalHistory(),
        patientApi.getConsultations(),
      ]);
      setHistory(historyData || { events: [], counts: {} });
      setConsultations(consultationList || []);
      setError("");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const consultationColumns = [
    {
      header: "Diagnosis",
      primary: true,
      render: (row) => <span className="font-semibold text-teal-deep">{row.diagnosis || "Consultation"}</span>,
    },
    {
      header: "Doctor",
      render: (row) => row.doctor?.name || "-",
    },
    {
      header: "Complaint",
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{row.chiefComplaint || "-"}</span>,
    },
    {
      header: "Completed",
      render: (row) => formatDate(row.completedAt || row.startedAt || row.createdAt),
    },
    {
      header: "Status",
      render: (row) => <StatusBadge status={humanise(row.status)} />,
    },
  ];

  const counts = history.counts || {};

  return (
    <PatientPageShell
      title="Medical history"
      description="Everything recorded for you, from visits to verified results."
      actions={
        <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Appointments", value: counts.appointments },
          { label: "Consultations", value: counts.consultations },
          { label: "Prescriptions", value: counts.prescriptions },
          { label: "Lab requests", value: counts.labRequests },
          { label: "Verified reports", value: counts.labReports },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-deept/10 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{stat.label}</p>
            <p className="mt-1 font-heading text-2xl font-extrabold text-teal-deep">
              {loading ? "-" : stat.value ?? 0}
            </p>
          </div>
        ))}
      </div>

      <PatientCard
        title="History"
        description="Newest first."
        action={
          <div className="flex flex-wrap gap-2">
            {TABS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTab(option.key)}
                className={tab === option.key ? SECONDARY_BUTTON.replace("px-4 py-2.5", "px-3 py-2 border-teal-mid bg-teal-pale") : CHIP_BUTTON}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {error && <p className="mb-3 text-sm font-semibold text-coral-dark">{error}</p>}

        {tab === "consultations" ? (
          <PatientResponsiveList
            columns={consultationColumns}
            rows={consultations}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            empty={!loading && !error && consultations.length === 0}
            emptyMessage="No consultations recorded yet."
          />
        ) : loading ? (
          <p className="py-6 text-center text-sm text-ink-soft">Loading your history...</p>
        ) : (history.events || []).length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">
            Nothing recorded yet. Your history builds up as you book visits and receive results.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l border-deept/10 pl-5">
            {history.events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  className={`absolute -left-[26px] top-1 flex size-3 items-center justify-center rounded-full ring-4 ring-white ${
                    EVENT_TONE[event.type] || "bg-deept/20"
                  }`}
                />
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{humanise(event.type)}</p>
                    <p className="font-semibold text-teal-deep">{event.title}</p>
                    {event.subtitle && <p className="mt-0.5 text-sm text-ink-soft">{event.subtitle}</p>}
                    {event.reference && <p className="mt-0.5 font-mono text-xs text-ink-soft">{event.reference}</p>}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-ink-soft">{formatDateTime(event.at)}</p>
                    {event.status && (
                      <div className="mt-1">
                        <StatusBadge status={humanise(event.status)} />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 flex items-center gap-2 text-xs text-ink-soft">
          <History className="size-4 shrink-0 text-teal-mid" />
          Your doctor&rsquo;s private working notes are never shown here.
        </div>
        <div className="mt-3">
          <PatientTrustNote />
        </div>
      </PatientCard>
    </PatientPageShell>
  );
}