import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, GitBranch, Printer, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabResponsiveList, LabTrustNote } from "./LabPageShell";

// SRS FR-LB-05: generate -> verify -> approve. SUPERSEDED is shown too so a
// correction is visible in the history rather than silently disappearing.
const REPORT_STATUSES = ["DRAFT", "COMPLETED", "VERIFIED", "APPROVED", "SUPERSEDED"];

const VERIFY_CHECKS = [
  { key: "resultsChecked", label: "I have checked every result value" },
  { key: "referenceRangesChecked", label: "I have checked the reference ranges applied" },
  { key: "attachmentsChecked", label: "I have checked the attachments on this report" },
];

const emptyChecks = { resultsChecked: false, referenceRangesChecked: false, attachmentsChecked: false };

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

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [completedRequests, setCompletedRequests] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [viewing, setViewing] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ labRequest: "", remarks: "" });
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
      const [reportData, requestData, sampleData] = await Promise.all([
        laboratoryApi.getReports({ limit: 0 }),
        laboratoryApi.getRequests({ status: "COMPLETED", limit: 0 }),
        laboratoryApi.getSamples({ limit: 0 }),
      ]);
      setReports(reportData);
      setCompletedRequests(requestData);
      setSamples(sampleData);
    } catch (loadError) {
      const message = getApiError(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const sampleFor = (requestId) => samples.find((sample) => String(sample.labRequest?._id || sample.labRequest) === String(requestId)) || null;

  const generate = async (event) => {
    event.preventDefault();
    if (!form.labRequest) {
      toast.error("Select a completed request");
      return;
    }
    setGenerating(true);
    try {
      const request = completedRequests.find((item) => item._id === form.labRequest);
      const sample = sampleFor(request._id);
      if (!sample) {
        throw new Error("No collected sample is linked to this request, so a report cannot be generated.");
      }
      const existing = await laboratoryApi.getResults({ labRequest: request._id, limit: 0 });
      if (!existing.length) {
        throw new Error("No results have been recorded for this request yet. Enter results on the processing bench first.");
      }
      const report = await laboratoryApi.createReport({
        labRequest: request._id,
        sample: sample._id,
        results: existing.map((result) => result._id),
        remarks: form.remarks || undefined,
      });
      toast.success(`Report ${report.reportId} generated and awaiting verification`);
      setForm({ labRequest: "", remarks: "" });
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

      <LabCard title="Generate a report" description="Reports are built from the results already recorded against a completed request.">
        <form onSubmit={generate} className="grid gap-4 lg:grid-cols-[2fr_2fr_auto] lg:items-end">
          <div>
            <label htmlFor="report-request" className={labelClass}>Completed request</label>
            <select
              id="report-request"
              required
              value={form.labRequest}
              onChange={(event) => setForm((current) => ({ ...current, labRequest: event.target.value }))}
              className={fieldClass}
            >
              <option value="">Select a completed request</option>
              {reportableRequests.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.patient?.name || "Patient"} &middot; {item.test?.name || item.test?.testName || "Laboratory test"}
                </option>
              ))}
            </select>
            {!loading && !reportableRequests.length && (
              <p className="mt-2 text-xs text-ink-soft">Every completed request already has a report, or none have finished processing yet.</p>
            )}
          </div>
          <div>
            <label htmlFor="report-remarks" className={labelClass}>Report remarks (optional)</label>
            <input
              id="report-remarks"
              value={form.remarks}
              onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
              className={fieldClass}
            />
          </div>
          <button
            type="submit"
            disabled={generating || !reportableRequests.length}
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
        {viewing && (
          <div className="space-y-5">
            {String(viewing.status).toUpperCase() === "SUPERSEDED" && (
              <p className="rounded-xl border border-coral-dark/30 bg-coral-pale px-4 py-3 text-sm font-semibold text-coral-dark">
                This report has been superseded by a corrected revision. It is retained for the record but no longer the current result.
              </p>
            )}
            <dl>
              <DetailRow label="Patient" value={viewing.patient ? `${viewing.patient.name} (${viewing.patient.email || "no email"})` : "-"} />
              <DetailRow label="Requesting doctor" value={viewing.doctor?.name || "-"} />
              <DetailRow label="Test" value={viewing.test?.name || viewing.test?.testName || "-"} />
              <DetailRow label="Specimen" value={viewing.sample ? `${viewing.sample.sampleId} (${viewing.sample.sampleType})` : "-"} />
              <DetailRow label="Revision" value={Number(viewing.revision) > 1 ? `Revision ${viewing.revision}` : "Original"} />
              {viewing.amendmentReason && <DetailRow label="Amendment reason" value={viewing.amendmentReason} />}
              <DetailRow label="Generated" value={`${formatDateTime(viewing.generatedAt)} by ${viewing.generatedBy?.name || "laboratory staff"}`} />
              <DetailRow label="Verified" value={viewing.verifiedAt ? `${formatDateTime(viewing.verifiedAt)} by ${viewing.verifiedBy?.name || "laboratory staff"}` : "Not yet verified"} />
              <DetailRow label="Approved" value={viewing.approvedAt ? `${formatDateTime(viewing.approvedAt)} by ${viewing.approvedBy?.name || "laboratory staff"}` : "Not yet approved"} />
              <DetailRow label="Status" value={<StatusBadge status={viewing.status} />} />
              <DetailRow label="Remarks" value={viewing.remarks || "No remarks were recorded."} />
            </dl>

            {viewing.verificationChecks && (
              <div>
                <h3 className="mb-2 font-heading text-lg font-bold text-teal-deep">Review attestation</h3>
                <ul className="space-y-1 text-sm text-ink">
                  {VERIFY_CHECKS.map((item) => (
                    <li key={item.key} className="flex items-center gap-2">
                      <CheckCircle2 className={`size-4 ${viewing.verificationChecks[item.key] ? "text-teal-mid" : "text-ink-soft/40"}`} />
                      <span className={viewing.verificationChecks[item.key] ? "" : "text-ink-soft line-through"}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 font-heading text-lg font-bold text-teal-deep">Results</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-deept/10 bg-softteal/50">
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Parameter</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Value</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Reference</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Flag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {(viewing.results || []).flatMap((result) =>
                      (result.parameters || []).map((parameter, index) => (
                        <tr key={`${result._id}-${index}`}>
                          <td className="px-3 py-2 font-medium text-ink">{parameter.parameter}</td>
                          <td className="px-3 py-2 font-mono text-ink">{parameter.value}{parameter.unit ? ` ${parameter.unit}` : ""}</td>
                          <td className="px-3 py-2 text-ink-soft">{parameter.referenceRange || "-"}</td>
                          <td className="px-3 py-2"><StatusBadge status={parameter.flag} /></td>
                        </tr>
                      ))
                    )}
                    {!(viewing.results || []).length && (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-ink-soft">This report has no recorded results.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {viewing.doctorComments?.length > 0 && (
              <div>
                <h3 className="mb-2 font-heading text-lg font-bold text-teal-deep">Doctor comments</h3>
                <ul className="space-y-2">
                  {viewing.doctorComments.map((comment, index) => (
                    <li key={index} className="rounded-xl border border-deept/10 p-3 text-sm text-ink">
                      <p>{comment.comment}</p>
                      <p className="mt-1 text-xs text-ink-soft">{comment.doctor?.name || "Doctor"} &middot; {formatDateTime(comment.commentedAt)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

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
