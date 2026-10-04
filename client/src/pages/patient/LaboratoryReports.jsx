import { useCallback, useEffect, useState } from "react";
import { Eye, FlaskConical, RefreshCw } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { patientApi, getApiError } from "@/services/patientApi";
import {
  PatientCard,
  PatientPageShell,
  PatientResponsiveList,
  PatientTrustNote,
  StatusBadge,
  CHIP_BUTTON,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  formatDateTime,
  formatMoney,
  humanise,
} from "./patientUi";

const TABS = [
  { key: "reports", label: "Verified reports" },
  { key: "requests", label: "Test requests" },
];

/**
 * Laboratory results (FR-PT-07).
 *
 * Two tabs over the same shared laboratory records:
 * - Reports are the VERIFIED ones only. The server filters on `status:
 *   "VERIFIED"`, so a report that has not been signed off cannot appear here even
 *   if the id were guessed.
 * - Requests show where each ordered test has got to, using the stage the server
 *   sends rather than a progress bar this screen invents.
 *
 * Opening a report prints it with the browser's own print stylesheet. HILMS has no
 * lab-report PDF renderer, so inventing a downloadable file here would produce a
 * document the clinic does not issue.
 */
export default function PatientLaboratoryReports() {
  const [tab, setTab] = useState("reports");
  const [reports, setReports] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [openReport, setOpenReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const [reportList, requestList] = await Promise.all([
          patientApi.getLabReports(),
          patientApi.getLabRequests(),
        ]);
        setReports(reportList || []);
        setRequests(requestList || []);
        setError("");
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const viewReport = async (id) => {
    setReportLoading(true);
    setReportError("");
    setOpenReport({ loading: true });
    try {
      const report = await patientApi.getLabReport(id);
      setOpenReport(report);
    } catch (requestError) {
      setReportError(getApiError(requestError));
      setOpenReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const reportColumns = [
    {
      header: "Test",
      primary: true,
      render: (row) => <span className="font-semibold text-teal-deep">{row.test?.name || "Laboratory test"}</span>,
    },
    {
      header: "Report ID",
      render: (row) => <span className="font-mono text-xs">{row.reportId || "-"}</span>,
    },
    {
      header: "Verified",
      render: (row) => formatDateTime(row.verifiedAt),
    },
    {
      header: "Doctor",
      render: (row) => row.doctor?.name || "-",
    },
    {
      header: "Status",
      render: () => <StatusBadge status="Verified" />,
    },
  ];

  const requestColumns = [
    {
      header: "Test",
      primary: true,
      render: (row) => <span className="font-semibold text-teal-deep">{row.test?.name || "Laboratory test"}</span>,
    },
    {
      header: "Requested",
      render: (row) => formatDateTime(row.requestedDate),
    },
    {
      header: "Priority",
      render: (row) => <StatusBadge status={humanise(row.priority)} />,
    },
    {
      header: "Progress",
      render: (row) => (
        <div className="min-w-[150px]">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-deept/10">
            <div
              className="h-full rounded-full bg-teal-mid transition-all"
              style={{ width: `${Math.round(((row.stage + 1) / (row.totalStages || 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {humanise(row.status)}
            {row.totalStages ? ` (step ${row.stage + 1} of ${row.totalStages})` : ""}
          </p>
        </div>
      ),
    },
    {
      header: "Price",
      hideOnMobile: true,
      align: "right",
      render: (row) => (row.test?.price != null ? formatMoney(row.test.price) : "-"),
    },
  ];

  return (
    <PatientPageShell
      title="Laboratory"
      description="Verified results, and where each ordered test has got to."
      actions={
        <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <PatientCard
        title="Results"
        description="A result appears here only once the laboratory has verified it."
        action={
          <div className="flex flex-wrap gap-2">
            {TABS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTab(option.key)}
                className={tab === option.key ? PRIMARY_BUTTON.replace("px-4 py-2.5", "px-3 py-2") : CHIP_BUTTON}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {tab === "reports" ? (
          <PatientResponsiveList
            columns={reportColumns}
            rows={reports}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            empty={!loading && !error && reports.length === 0}
            emptyMessage="No verified reports yet. Results appear here as soon as the laboratory signs them off."
            actions={(row) => (
              <button
                type="button"
                onClick={() => viewReport(row.id)}
                className={SECONDARY_BUTTON.replace("px-4 py-2.5", "px-3 py-2")}
              >
                <Eye className="size-4" />
                View
              </button>
            )}
          />
        ) : (
          <PatientResponsiveList
            columns={requestColumns}
            rows={requests}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            empty={!loading && !error && requests.length === 0}
            emptyMessage="No laboratory tests have been ordered for you yet."
          />
        )}

        <div className="mt-4">
          <PatientTrustNote />
        </div>
      </PatientCard>

      <Modal
        open={Boolean(openReport)}
        onClose={() => setOpenReport(null)}
        title={openReport?.test?.name || "Laboratory report"}
        description={openReport?.reportId ? `Report ${openReport.reportId}` : ""}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setOpenReport(null)} className={SECONDARY_BUTTON}>
              Close
            </button>
            <button type="button" onClick={() => window.print()} className={PRIMARY_BUTTON}>
              Print report
            </button>
          </>
        }
      >
        {reportLoading || openReport?.loading ? (
          <p className="text-sm text-ink-soft">Loading report...</p>
        ) : reportError ? (
          <p className="text-sm font-semibold text-coral-dark">{reportError}</p>
        ) : openReport ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className={LABEL_CLASS}>Verified</dt>
                <dd className="font-semibold text-teal-deep">{formatDateTime(openReport.verifiedAt)}</dd>
              </div>
              <div>
                <dt className={LABEL_CLASS}>Sample</dt>
                <dd className="font-semibold text-teal-deep">{openReport.sample?.sampleId || "-"}</dd>
              </div>
              <div>
                <dt className={LABEL_CLASS}>Collected</dt>
                <dd className="font-semibold text-teal-deep">{formatDateTime(openReport.sample?.collectedAt)}</dd>
              </div>
              <div>
                <dt className={LABEL_CLASS}>Doctor</dt>
                <dd className="font-semibold text-teal-deep">{openReport.doctor?.name || "-"}</dd>
              </div>
              <div>
                <dt className={LABEL_CLASS}>Sample type</dt>
                <dd className="font-semibold text-teal-deep">{humanise(openReport.sample?.sampleType)}</dd>
              </div>
              <div>
                <dt className={LABEL_CLASS}>Status</dt>
                <dd>
                  <StatusBadge status="Verified" />
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 font-heading text-base font-bold text-teal-deep">Results</h3>
              <div className="overflow-hidden rounded-xl border border-deept/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-deept/10 bg-softteal/50">
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Parameter</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Value</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Reference</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {(openReport.parameters || []).map((parameter, index) => (
                      <tr key={`${parameter.parameter}-${index}`}>
                        <td className="px-3 py-2 font-semibold">{parameter.parameter}</td>
                        <td className="px-3 py-2">
                          {parameter.value} {parameter.unit || ""}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{parameter.referenceRange || "-"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={humanise(parameter.flag)} />
                        </td>
                      </tr>
                    ))}
                    {(openReport.parameters || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-ink-soft">
                          This report has no recorded parameters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {openReport.remarks && (
              <div>
                <h3 className="mb-1 font-heading text-base font-bold text-teal-deep">Laboratory remarks</h3>
                <p className="text-sm text-ink-soft">{openReport.remarks}</p>
              </div>
            )}

            {(openReport.doctorComments || []).length > 0 && (
              <div>
                <h3 className="mb-2 font-heading text-base font-bold text-teal-deep">Your doctor's comments</h3>
                <ul className="space-y-2">
                  {openReport.doctorComments.map((entry, index) => (
                    <li key={index} className="rounded-xl bg-teal-pale/40 px-3 py-2">
                      <p className="text-sm font-semibold text-teal-deep">{entry.comment}</p>
                      {entry.interpretation && <p className="mt-1 text-sm text-ink-soft">{entry.interpretation}</p>}
                      <p className="mt-1 text-xs text-ink-soft">{formatDateTime(entry.commentedAt)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {!loading && reports.length === 0 && requests.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-ink-soft">
          <FlaskConical className="size-4 text-teal-mid" />
          Your tests are still being processed. You will be notified when a report is verified.
        </p>
      )}
    </PatientPageShell>
  );
}