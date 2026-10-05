import { useCallback, useEffect, useState } from "react";
import { Eye, FlaskConical, RefreshCw } from "lucide-react";
import { Modal } from "@/components/common/Modal";
import { patientApi, getApiError } from "@/services/patientApi";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
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

function LaboratoryReportDocument({ report }) {
  if (!report || report.loading) return null;

  return (
    <div className="space-y-5 bg-white p-4 text-black">
      <h1 className="text-xl font-bold">{report.test?.name || "Laboratory report"}</h1>
      <p className="text-sm">Report {report.reportId || "-"}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><dt className={LABEL_CLASS}>Verified</dt><dd>{formatDateTime(report.verifiedAt)}</dd></div>
        <div><dt className={LABEL_CLASS}>Sample</dt><dd>{report.sample?.sampleId || "-"}</dd></div>
        <div><dt className={LABEL_CLASS}>Collected</dt><dd>{formatDateTime(report.sample?.collectedAt)}</dd></div>
        <div><dt className={LABEL_CLASS}>Doctor</dt><dd>{report.doctor?.name || "-"}</dd></div>
        <div><dt className={LABEL_CLASS}>Sample type</dt><dd>{humanise(report.sample?.sampleType)}</dd></div>
        <div><dt className={LABEL_CLASS}>Status</dt><dd>Verified</dd></div>
      </dl>

      <div>
        <h2 className="mb-2 font-heading text-base font-bold text-teal-deep">Results</h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-deept/20">
              <th className="px-3 py-2">Parameter</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Flag</th>
            </tr>
          </thead>
          <tbody>
            {(report.parameters || []).map((parameter, index) => (
              <tr key={`${parameter.parameter}-${index}`} className="border-b border-deept/10">
                <td className="px-3 py-2">{parameter.parameter}</td>
                <td className="px-3 py-2">{parameter.value} {parameter.unit || ""}</td>
                <td className="px-3 py-2">{parameter.referenceRange || "-"}</td>
                <td className="px-3 py-2">{humanise(parameter.flag)}</td>
              </tr>
            ))}
            {!(report.parameters || []).length && (
              <tr><td colSpan={4} className="px-3 py-6 text-center">This report has no recorded parameters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {report.remarks && (
        <div>
          <h2 className="mb-1 font-heading text-base font-bold text-teal-deep">Laboratory remarks</h2>
          <p className="text-sm">{report.remarks}</p>
        </div>
      )}

      {(report.doctorComments || []).length > 0 && (
        <div>
          <h2 className="mb-2 font-heading text-base font-bold text-teal-deep">Your doctor's comments</h2>
          <ul className="space-y-2">
            {report.doctorComments.map((entry, index) => (
              <li key={index} className="border-b border-deept/10 py-2">
                <p className="text-sm font-semibold">{entry.comment}</p>
                {entry.interpretation && <p className="mt-1 text-sm">{entry.interpretation}</p>}
                <p className="mt-1 text-xs">{formatDateTime(entry.commentedAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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

  useSocketEvent("connect", load);

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

  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_VERIFIED, (event) => {
    load({ quiet: true });
    if (openReport?._id && openReport._id === event.reportId) viewReport(openReport._id);
  });
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_APPROVED, (event) => {
    load({ quiet: true });
    if (openReport?._id && openReport._id === event.reportId) viewReport(openReport._id);
  });

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
        ) : (
          <LaboratoryReportDocument report={openReport} />
        )}
      </Modal>
      <div className="print-document" aria-hidden="true">
        <LaboratoryReportDocument report={openReport} />
      </div>

      {!loading && reports.length === 0 && requests.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-ink-soft">
          <FlaskConical className="size-4 text-teal-mid" />
          Your tests are still being processed. You will be notified when a report is verified.
        </p>
      )}
    </PatientPageShell>
  );
}