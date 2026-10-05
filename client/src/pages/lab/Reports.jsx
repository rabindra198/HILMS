import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, GitBranch, Printer, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabResponsiveList, LabTrustNote } from "./LabPageShell";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

// SRS FR-LB-05: generate -> verify -> approve. SUPERSEDED is shown too so a
// correction is visible in the history rather than silently disappearing.
const REPORT_STATUSES = ["DRAFT", "COMPLETED", "VERIFIED", "APPROVED", "SUPERSEDED"];

const VERIFY_CHECKS = [
  { key: "resultsChecked", label: "I have checked every result value" },
  { key: "referenceRangesChecked", label: "I have checked the reference ranges applied" },
  { key: "attachmentsChecked", label: "I have checked the attachments on this report" },
];

const emptyChecks = { resultsChecked: false, referenceRangesChecked: false, attachmentsChecked: false };
const emptyParameter = (parameter = "") => ({
  parameter,
  value: "",
  unit: "",
  referenceRange: "",
  min: null,
  max: null,
  isNumeric: true,
  isRequired: true,
  flag: "NORMAL",
  remarks: "",
});

const deriveFlag = (value, min, max) => {
  if (min == null && max == null) return null;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (min != null && numeric < min) return "LOW";
  if (max != null && numeric > max) return "HIGH";
  return "NORMAL";
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const fieldClass = "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";
const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-deept/5 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-44 shrink-0 text-xs font-bold uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value || "-"}</dd>
    </div>
  );
}

function ReportDocument({ report }) {
  if (!report) return null;

  return (
    <div className="space-y-5 bg-white p-4 text-black">
      <h1 className="text-xl font-bold">Laboratory report {report.reportId}</h1>
      {String(report.status).toUpperCase() === "SUPERSEDED" && (
        <p className="rounded-xl border border-coral-dark/30 bg-coral-pale px-4 py-3 text-sm font-semibold text-coral-dark">
          This report has been superseded by a corrected revision. It is retained for the record but no longer the current result.
        </p>
      )}
      <dl>
        <DetailRow label="Patient" value={report.patient ? `${report.patient.name} (${report.patient.email || "no email"})` : "-"} />
        <DetailRow label="Requesting doctor" value={report.doctor?.name || "-"} />
        <DetailRow label="Test" value={report.test?.name || report.test?.testName || "-"} />
        <DetailRow label="Specimen" value={report.sample ? `${report.sample.sampleId} (${report.sample.sampleType})` : "-"} />
        <DetailRow label="Revision" value={Number(report.revision) > 1 ? `Revision ${report.revision}` : "Original"} />
        {report.amendmentReason && <DetailRow label="Amendment reason" value={report.amendmentReason} />}
        <DetailRow label="Generated" value={`${formatDateTime(report.generatedAt)} by ${report.generatedBy?.name || "laboratory staff"}`} />
        <DetailRow label="Verified" value={report.verifiedAt ? `${formatDateTime(report.verifiedAt)} by ${report.verifiedBy?.name || "laboratory staff"}` : "Not yet verified"} />
        <DetailRow label="Approved" value={report.approvedAt ? `${formatDateTime(report.approvedAt)} by ${report.approvedBy?.name || "laboratory staff"}` : "Not yet approved"} />
        <DetailRow label="Status" value={report.status} />
        <DetailRow label="Remarks" value={report.remarks || "No remarks were recorded."} />
      </dl>

      {report.verificationChecks && (
        <div>
          <h2 className="mb-2 font-heading text-lg font-bold text-teal-deep">Review attestation</h2>
          <ul className="space-y-1 text-sm text-ink">
            {VERIFY_CHECKS.map((item) => (
              <li key={item.key}>{report.verificationChecks[item.key] ? "[x]" : "[ ]"} {item.label}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold text-teal-deep">Results</h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b-2 border-deept/20">
              <th className="px-3 py-2">Parameter</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Flag</th>
            </tr>
          </thead>
          <tbody>
            {(report.results || []).flatMap((result) =>
              (result.parameters || []).map((parameter, index) => (
                <tr key={`${result._id}-${index}`} className="border-b border-deept/10">
                  <td className="px-3 py-2">{parameter.parameter}</td>
                  <td className="px-3 py-2">{parameter.value}{parameter.unit ? ` ${parameter.unit}` : ""}</td>
                  <td className="px-3 py-2">{parameter.referenceRange || "-"}</td>
                  <td className="px-3 py-2">{parameter.flag || "-"}</td>
                </tr>
              ))
            )}
            {!(report.results || []).some((result) => (result.parameters || []).length > 0) && (
              <tr><td colSpan={4} className="px-3 py-4 text-center">This report has no recorded results.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {report.doctorComments?.length > 0 && (
        <div>
          <h2 className="mb-2 font-heading text-lg font-bold text-teal-deep">Doctor comments</h2>
          <ul className="space-y-2">
            {report.doctorComments.map((comment, index) => (
              <li key={index} className="border-b border-deept/10 p-3 text-sm">
                <p>{comment.comment}</p>
                <p className="mt-1 text-xs">{comment.doctor?.name || "Doctor"} · {formatDateTime(comment.commentedAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [completedRequests, setCompletedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [viewing, setViewing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ labRequest: "", remarks: "" });
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState("");
  const [recordedResults, setRecordedResults] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [selectedSample, setSelectedSample] = useState(null);
  // Verification is a formal attestation: the report is not released until every
  // check is confirmed, so it opens a checklist rather than firing immediately.
  const [verifying, setVerifying] = useState(null);
  const [checks, setChecks] = useState(emptyChecks);
  const [revising, setRevising] = useState(null);
  const [revisionReason, setRevisionReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reportData, requestData] = await Promise.all([
        laboratoryApi.getReports({ limit: 0 }),
        laboratoryApi.getRequests({ status: "COMPLETED", limit: 0 }),
      ]);
      setReports(reportData);
      setCompletedRequests(requestData);
    } catch (loadError) {
      const message = getApiError(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_VERIFIED, load);
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_APPROVED, load);
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_REVISED, load);
  useSocketEvent("connect", load);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (status && String(report.status).toUpperCase() !== status) return false;
      if (!query) return true;
      return [report.reportId, report._id, report.patient?.name, report.doctor?.name, report.test?.name, report.test?.testName]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [reports, search, status]);

  // A completed request can only be reported once, so any request that already
  // has a live report is filtered out of the generation form. A SUPERSEDED report
  // is ignored: the request has a current revision, and offering it again would
  // only produce a 409.
  const reportedRequestIds = useMemo(
    () => new Set(reports.filter((report) => String(report.status).toUpperCase() !== "SUPERSEDED").map((report) => String(report.labRequest))),
    [reports]
  );
  const reportableRequests = useMemo(
    () => completedRequests.filter((request) => !reportedRequestIds.has(String(request._id))),
    [completedRequests, reportedRequestIds]
  );

  const selectedRequest = reportableRequests.find((request) => String(request._id) === form.labRequest);
  useEffect(() => {
    if (!selectedRequest) {
      setRecordedResults([]);
      setParameters([]);
      setResultError("");
      setSelectedSample(null);
      setResultLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadResultForm = async () => {
      setResultLoading(true);
      setResultError("");
      setRecordedResults([]);
      setParameters([]);
      try {
        const [sampleData, existing] = await Promise.all([
          laboratoryApi.getSamples({ labRequest: selectedRequest._id, limit: 0 }),
          laboratoryApi.getResults({ labRequest: selectedRequest._id, limit: 0 }),
        ]);
        if (cancelled) return;
        const sample = sampleData.find(
          (item) => String(item.labRequest?._id || item.labRequest) === String(selectedRequest._id)
        );
        setSelectedSample(sample || null);
        setRecordedResults(existing);
        if (existing.length) return;

        const testId = selectedRequest.test?._id || selectedRequest.test;
        const patientId = selectedRequest.patient?._id || selectedRequest.patient;
        if (!testId) {
          setParameters([emptyParameter(selectedRequest.test?.name || selectedRequest.test?.testName || "Test result")]);
          return;
        }
        const template = await laboratoryApi.getTestParameters(testId, patientId);
        if (cancelled) return;
        const rows = (template?.parameters || []).map((parameter) => ({
          ...emptyParameter(parameter.parameter),
          ...parameter,
          value: "",
          flag: "NORMAL",
          remarks: "",
        }));
        setParameters(rows.length ? rows : [emptyParameter(selectedRequest.test?.name || selectedRequest.test?.testName || "")]);
      } catch (loadError) {
        if (!cancelled) {
          const message = getApiError(loadError);
          setResultError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setResultLoading(false);
      }
    };

    loadResultForm();
    return () => {
      cancelled = true;
    };
  }, [selectedRequest]);

  const updateParameter = (index, key, value) => {
    setParameters((current) =>
      current.map((parameter, position) => {
        if (position !== index) return parameter;
        const next = { ...parameter, [key]: value };
        if (key === "value") {
          const derived = deriveFlag(value, parameter.min, parameter.max);
          if (derived) next.flag = derived;
        }
        return next;
      })
    );
  };

  const generate = async (event) => {
    event.preventDefault();
    if (!selectedRequest) {
      toast.error("Select a completed request");
      return;
    }
    setGenerating(true);
    try {
      const request = selectedRequest;
      const currentSamples = await laboratoryApi.getSamples({ labRequest: request._id, limit: 0 });
      const sample = currentSamples.find(
        (item) => String(item.labRequest?._id || item.labRequest) === String(request._id)
      );
      setSelectedSample(sample || null);
      if (!sample) {
        throw new Error("No collected sample is linked to this request, so a report cannot be generated.");
      }

      let results = await laboratoryApi.getResults({ labRequest: request._id, limit: 0 });
      setRecordedResults(results);
      if (!results.length) {
        const missingRequired = parameters.some((parameter) =>
          parameter.isRequired !== false &&
          (!String(parameter.parameter || "").trim() || !String(parameter.value || "").trim())
        );
        if (missingRequired) {
          toast.error("Enter a value for every required result parameter");
          return;
        }
        const filled = parameters.filter((parameter) =>
          String(parameter.parameter || "").trim() && String(parameter.value || "").trim()
        );
        if (!filled.length) {
          toast.error("Enter at least one result parameter and value");
          return;
        }
        const result = await laboratoryApi.createResult({
          labRequest: request._id,
          sample: sample._id,
          parameters: filled.map(({ parameter, value, flag, remarks }) => ({ parameter, value, flag, remarks })),
        });
        results = [result];
        setRecordedResults(results);
      }
      const report = await laboratoryApi.createReport({
        labRequest: request._id,
        sample: sample._id,
        results: results.map((result) => result._id),
        remarks: form.remarks || undefined,
      });
      toast.success(`Report ${report.reportId} generated and awaiting verification`);
      setForm({ labRequest: "", remarks: "" });
      setRecordedResults([]);
      setParameters([]);
      await load();
    } catch (generateError) {
      toast.error(generateError.response ? getApiError(generateError) : generateError.message);
    } finally {
      setGenerating(false);
    }
  };

  const openVerify = (report) => {
    setChecks(emptyChecks);
    setVerifying(report);
  };

  const confirmVerify = async () => {
    if (!verifying) return;
    const report = verifying;
    setBusyId(report._id);
    try {
      await laboratoryApi.verifyReport(report._id, checks);
      toast.success(`Report ${report.reportId} verified and released`);
      setVerifying(null);
      await load();
    } catch (verifyError) {
      toast.error(getApiError(verifyError));
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (report) => {
    setBusyId(report._id);
    try {
      await laboratoryApi.approveReport(report._id);
      toast.success(`Report ${report.reportId} approved as final`);
      await load();
    } catch (approveError) {
      toast.error(getApiError(approveError));
    } finally {
      setBusyId(null);
    }
  };

  const openRevise = (report) => {
    setRevisionReason("");
    setRevising(report);
  };

  const confirmRevise = async () => {
    if (!revising) return;
    const reason = revisionReason.trim();
    if (!reason) {
      toast.error("A reason is required to raise a correction");
      return;
    }
    setBusyId(revising._id);
    try {
      const revision = await laboratoryApi.reviseReport(revising._id, reason);
      toast.success(`Correction ${revision.reportId} raised; the original is superseded`);
      setRevising(null);
      await load();
    } catch (reviseError) {
      toast.error(getApiError(reviseError));
    } finally {
      setBusyId(null);
    }
  };

  // Counted explicitly rather than as `total - awaitingVerification`, because a
  // draft report is neither released nor pending and would silently inflate the
  // "verified" total.
  const awaitingVerification = reports.filter((report) => String(report.status).toUpperCase() === "COMPLETED").length;
  const verifiedCount = reports.filter((report) => String(report.status).toUpperCase() === "VERIFIED").length;
  const approvedCount = reports.filter((report) => String(report.status).toUpperCase() === "APPROVED").length;

  const allChecked = VERIFY_CHECKS.every((item) => checks[item.key]);

  return (
    <LabPageShell
      title="Reports"
      description="Generate laboratory reports, verify them against the results, and approve them as final."
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <LabCard title="Reports generated"><p className="font-heading text-3xl font-extrabold text-teal-deep">{loading ? "..." : reports.length}</p><p className="mt-1 text-sm text-ink-soft">Across the laboratory</p></LabCard>
        <LabCard title="Awaiting verification"><p className="font-heading text-3xl font-extrabold text-coral-dark">{loading ? "..." : awaitingVerification}</p><p className="mt-1 text-sm text-ink-soft">Not yet released</p></LabCard>
        <LabCard title="Verified"><p className="font-heading text-3xl font-extrabold text-teal-deep">{loading ? "..." : verifiedCount}</p><p className="mt-1 text-sm text-ink-soft">Released, awaiting approval</p></LabCard>
        <LabCard title="Approved"><p className="font-heading text-3xl font-extrabold text-teal-deep">{loading ? "..." : approvedCount}</p><p className="mt-1 text-sm text-ink-soft">Final clinical documents</p></LabCard>
      </div>

      <LabCard title="Generate a report" description="Select a completed request, enter its results, and generate a report for verification.">
        <form onSubmit={generate} className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
            <label htmlFor="report-request" className={labelClass}>Completed request</label>
            <select
              id="report-request"
              required
              value={form.labRequest}
              onChange={(event) => {
                setSelectedSample(null);
                setForm((current) => ({ ...current, labRequest: event.target.value }));
              }}
              className={fieldClass}
            >
              <option value="">Select a completed request</option>
              {reportableRequests.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.patient?.name || "Patient"} &middot; {item.test?.name || item.test?.testName || "Laboratory test"}
                </option>
              ))}
            </select>
            {selectedRequest && (
              <p className="mt-2 text-xs text-ink-soft">
                {selectedRequest.patient?.name || "Patient"} · {selectedRequest.test?.name || selectedRequest.test?.testName || "Laboratory test"}
              </p>
            )}
            {!loading && !reportableRequests.length && (
              <p className="mt-2 text-xs text-ink-soft">Every completed request already has a report, or none have finished processing yet.</p>
            )}
          </div>
          <div>
            <label htmlFor="report-remarks" className={labelClass}>Report remarks (optional)</label>
            <input
              id="report-remarks"
              maxLength={2000}
              value={form.remarks}
              onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
              className={fieldClass}
            />
          </div>
          </div>

          {selectedRequest && (
            <div className="space-y-3 rounded-2xl border border-deept/10 bg-softteal/20 p-4">
              <div>
                <h3 className="text-sm font-extrabold text-teal-deep">Test results</h3>
                <p className="mt-1 text-xs text-ink-soft">
                  {recordedResults.length
                    ? "Previously recorded results will be included in this report."
                    : "Enter values below. Units and reference ranges come from the test configuration."}
                </p>
              </div>
              {resultLoading ? (
                <p className="text-sm text-ink-soft">Loading result fields...</p>
              ) : resultError ? (
                <p className="text-sm font-semibold text-coral-dark">{resultError}</p>
              ) : recordedResults.length ? (
                <div className="space-y-2">
                  {recordedResults.flatMap((result) => result.parameters || []).map((parameter, index) => (
                    <div key={`${parameter.parameter}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                      <span className="font-semibold text-ink">{parameter.parameter}</span>
                      <span className="text-ink-soft">
                        {parameter.value} {parameter.unit} · {parameter.referenceRange || "No reference range"} · {parameter.flag || "NORMAL"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {parameters.map((parameter, index) => (
                    <div key={`${parameter.parameter}-${index}`}>
                      <label htmlFor={`report-parameter-${index}`} className={labelClass}>
                        {parameter.parameter || "Result value"}{parameter.unit ? ` (${parameter.unit})` : ""}
                        {parameter.isRequired !== false && <span className="text-coral-dark"> *</span>}
                      </label>
                      <input
                        id={`report-parameter-${index}`}
                        required={parameter.isRequired !== false}
                        type={parameter.isNumeric === false ? "text" : "number"}
                        step={parameter.isNumeric === false ? undefined : "any"}
                        value={parameter.value}
                        onChange={(event) => updateParameter(index, "value", event.target.value)}
                        className={fieldClass}
                      />
                      {parameter.referenceRange && (
                        <p className="mt-1 text-xs text-ink-soft">Reference range: {parameter.referenceRange}</p>
                      )}
                      <label htmlFor={`report-flag-${index}`} className={`${labelClass} mt-2`}>Result flag</label>
                      <select
                        id={`report-flag-${index}`}
                        value={parameter.flag}
                        onChange={(event) => updateParameter(index, "flag", event.target.value)}
                        className={fieldClass}
                      >
                        {["NORMAL", "HIGH", "LOW", "ABNORMAL", "CRITICAL"].map((flag) => (
                          <option key={flag} value={flag}>{flag}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              {selectedRequest && !selectedSample && !resultLoading && !resultError && (
                <p className="text-xs font-semibold text-coral-dark">No collected sample is linked to this request. A report cannot be generated.</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={generating || resultLoading || Boolean(resultError) || !selectedRequest || !selectedSample}
            className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate report"}
          </button>
        </form>
      </LabCard>

      <LabCard
        title="Laboratory reports"
        description={loading ? "Loading reports..." : `${visible.length} of ${reports.length} reports shown.`}
      >
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search report ID, patient, doctor or test..."
              aria-label="Search reports"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by report status" className={fieldClass}>
            <option value="">All statuses</option>
            {REPORT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <LabResponsiveList
          rows={visible}
          loading={loading}
          error={error}
          empty={!visible.length}
          emptyMessage={reports.length ? "No reports match this filter." : "No reports have been generated yet."}
          columns={[
            { header: "Report", primary: true, render: (report) => (
              <span className="font-mono text-xs font-bold text-teal-mid">
                {report.reportId}{Number(report.revision) > 1 ? ` · rev ${report.revision}` : ""}
              </span>
            ) },
            { header: "Patient", render: (report) => <span className="font-medium text-ink">{report.patient?.name || "Patient"}</span> },
            { header: "Doctor", render: (report) => <span className="text-ink-soft">{report.doctor?.name || "-"}</span> },
            { header: "Test", render: (report) => <span className="text-ink-soft">{report.test?.name || report.test?.testName || "-"}</span> },
            { header: "Generated", render: (report) => <span className="text-ink-soft">{formatDateTime(report.generatedAt)}</span> },
            { header: "Status", render: (report) => <StatusBadge status={report.status} /> },
          ]}
          actions={(report) => {
            const current = String(report.status).toUpperCase();
            const busy = busyId === report._id;
            return (
              <>
                <button
                  type="button"
                  onClick={() => setViewing(report)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale"
                >
                  <Eye className="size-3.5" /> View
                </button>
                {/* Printing opens the same viewer, which carries the print stylesheet,
                    so the two buttons differ only in intent. */}
                <button
                  type="button"
                  onClick={() => setViewing(report)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale"
                >
                  <Printer className="size-3.5" /> Print
                </button>
                {current === "COMPLETED" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openVerify(report)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
                  >
                    <ShieldCheck className="size-3.5" /> Verify
                  </button>
                )}
                {current === "VERIFIED" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => approve(report)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
                  >
                    <CheckCircle2 className="size-3.5" /> {busy ? "Approving..." : "Approve"}
                  </button>
                )}
                {(current === "VERIFIED" || current === "APPROVED") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openRevise(report)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-coral-dark/30 px-3 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale disabled:opacity-50"
                  >
                    <GitBranch className="size-3.5" /> Correct
                  </button>
                )}
              </>
            );
          }}
        />
      </LabCard>

      {/* Report viewer / print surface */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? `Report ${viewing.reportId}` : "Report"}
        description={viewing ? `${viewing.test?.name || viewing.test?.testName || "Laboratory test"} for ${viewing.patient?.name || "patient"}` : undefined}
        size="lg"
        footer={
          <button type="button" onClick={() => window.print()} className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
            Print this report
          </button>
        }
      >
        <ReportDocument report={viewing} />
      </Modal>
      <div className="print-document" aria-hidden="true">
        <ReportDocument report={viewing} />
      </div>

      {/* Verification checklist (FR-LB-05): release only after every check. */}
      <Modal
        open={Boolean(verifying)}
        onClose={() => setVerifying(null)}
        title={verifying ? `Verify report ${verifying.reportId}` : "Verify report"}
        description="Confirm each check before the report is released to the requesting doctor and the patient."
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setVerifying(null)} className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
              Cancel
            </button>
            <button
              type="button"
              disabled={!allChecked || busyId === verifying?._id}
              onClick={confirmVerify}
              className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
            >
              {busyId === verifying?._id ? "Verifying..." : "Verify and release"}
            </button>
          </div>
        }
      >
        <ul className="space-y-3">
          {VERIFY_CHECKS.map((item) => (
            <li key={item.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-deept/10 p-3 text-sm text-ink transition hover:bg-teal-pale/50">
                <input
                  type="checkbox"
                  checked={checks[item.key]}
                  onChange={(event) => setChecks((current) => ({ ...current, [item.key]: event.target.checked }))}
                  className="mt-0.5 size-4 accent-teal-deep"
                />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Correction (FR-LB-05): a released report is never edited in place. */}
      <Modal
        open={Boolean(revising)}
        onClose={() => setRevising(null)}
        title={revising ? `Correct report ${revising.reportId}` : "Correct report"}
        description="A correction is issued as a new revision. The original is kept and marked SUPERSEDED; its number will not change."
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setRevising(null)} className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
              Cancel
            </button>
            <button
              type="button"
              disabled={!revisionReason.trim() || busyId === revising?._id}
              onClick={confirmRevise}
              className="rounded-xl bg-coral-dark px-5 py-2.5 text-sm font-bold text-white transition hover:bg-coral-dark/90 disabled:opacity-50"
            >
              {busyId === revising?._id ? "Raising..." : "Raise correction"}
            </button>
          </div>
        }
      >
        <label htmlFor="revision-reason" className={labelClass}>Reason for the correction</label>
        <textarea
          id="revision-reason"
          rows={3}
          value={revisionReason}
          onChange={(event) => setRevisionReason(event.target.value)}
          placeholder="Why is this report being corrected? This is recorded against the revision."
          className="w-full rounded-xl border border-deept/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
        />
      </Modal>

      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <FileText className="size-4 text-teal-mid" />
        A report becomes visible to the requesting doctor and the patient only after verification.
      </p>

      <LabTrustNote />
    </LabPageShell>
  );
}
