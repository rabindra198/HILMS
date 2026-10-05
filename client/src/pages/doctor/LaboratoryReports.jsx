import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeftRight,
  CheckCircle2,
  FlaskConical,
  MessageSquarePlus,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorResponsiveList,
  DoctorTrustNote,
  StatusBadge,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  CHIP_BUTTON,
  CHIP_PRIMARY,
  formatDate,
  humanise,
} from "./doctorUi";

/**
 * Laboratory report review (FR-DR-07, FR-DR-08).
 *
 * The doctor reads and comments; the laboratory enters and verifies values. That
 * split is the reason there is no "edit result" control on this screen - it would
 * defeat the audit trail the report exists to provide.
 *
 * Comparison needs two reports of the same test for the same patient, so the
 * server aligns rows on the parameter name and returns parameters that exist on
 * only one side with a null on the other. Those are shown rather than hidden.
 */

const FLAG_TONES = {
  HIGH: "border-coral/40 bg-coral-pale text-coral-dark",
  LOW: "border-coral/40 bg-coral-pale text-coral-dark",
  CRITICAL: "border-coral bg-coral-pale text-coral-dark",
  ABNORMAL: "border-coral/40 bg-coral-pale text-coral-dark",
  NORMAL: "border-deept/10 bg-white text-ink",
};

const FlagChip = ({ flag }) => (
  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${FLAG_TONES[String(flag || "NORMAL").toUpperCase()] || FLAG_TONES.NORMAL}`}>
    {humanise(flag || "NORMAL")}
  </span>
);

function ReportDetail({ reportId, onChanged, onClose }) {
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [compareWith, setCompareWith] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [treatmentDecision, setTreatmentDecision] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const [commentError, setCommentError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detail = await doctorApi.getReport(reportId);
      setReport(detail);

      // History is only meaningful once the test is known, so it is a second
      // request rather than a guess made before the report arrives.
      const testId = detail?.test?._id;
      if (testId && detail?.patient?._id) {
        try {
          setHistory(await doctorApi.getReportHistory({ patient: detail.patient._id, test: testId, limit: 10 }));
        } catch {
          setHistory([]);
        }
      }
    } catch (loadError) {
      setReport(null);
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_VERIFIED, load);
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_APPROVED, load);
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_REVISED, load);
  useSocketEvent("connect", load);

  useEffect(() => {
    load();
  }, [load]);

  const runCompare = async (previousId) => {
    setCompareWith(previousId);
    try {
      setComparison(
        await doctorApi.compareReports({ report: reportId, ...(previousId ? { previousReport: previousId } : {}) }),
      );
    } catch (compareError) {
      setComparison(null);
      toast.error(getDoctorApiError(compareError));
    }
  };

  const submitComment = async () => {
    if (saving) return;
    if (!comment.trim()) {
      setCommentError("Please write a comment");
      return;
    }
    setCommentError("");
    setSaving(true);
    try {
      await doctorApi.addReportComment(reportId, {
        comment: comment.trim(),
        ...(interpretation.trim() ? { interpretation: interpretation.trim() } : {}),
        ...(treatmentDecision.trim() ? { treatmentDecision: treatmentDecision.trim() } : {}),
        ...(outcome.trim() ? { outcome: outcome.trim() } : {}),
      });
      toast.success("Review saved and the patient notified");
      setComment("");
      setInterpretation("");
      setTreatmentDecision("");
      setOutcome("");
      await load();
      onChanged?.();
    } catch (saveError) {
      toast.error(getDoctorApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DoctorCard>
        <div className="space-y-4 py-4">
          <div className="h-10 w-52 animate-pulse rounded-xl bg-deept/5" />
          <div className="h-56 w-full animate-pulse rounded-xl bg-deept/5" />
        </div>
      </DoctorCard>
    );
  }

  if (error) {
    return (
      <DoctorCard>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-heading text-lg font-bold text-coral-dark">Report unavailable</p>
          <p className="max-w-sm text-sm text-ink-soft">{error}</p>
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Back to list
          </button>
        </div>
      </DoctorCard>
    );
  }

  if (!report) return null;

  const parameters = (report.results || []).flatMap((result) => result.parameters || []);
  const alreadyReviewed = (report.doctorComments || []).some((entry) => String(entry.doctor?._id || entry.doctor) === String(report.doctor?._id));

  return (
    <>
      <DoctorCard
        title={report.test?.name || report.test?.testName || "Laboratory report"}
        description={
          <>
            <span className="font-mono font-bold text-teal-mid">{report.reportId}</span> · {report.patient?.name} ·{" "}
            {formatDate(report.verifiedAt || report.generatedAt)}
          </>
        }
        action={<StatusBadge status={report.status} />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-ink-soft">Verified by</span>
            {report.verifiedBy?.name || "Laboratory"}
          </p>
          <p className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-ink-soft">Sample</span>
            {report.sample?.sampleId || "-"}
          </p>
          <p className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-ink-soft">Collected</span>
            {formatDate(report.sample?.collectionDate)}
          </p>
          <p className="text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-ink-soft">Priority</span>
            {humanise(report.labRequest?.priority)}
          </p>
        </div>

        {report.patient?.allergies && (
          <p className="mt-3 rounded-xl border-2 border-coral/40 bg-coral-pale px-4 py-2 text-sm font-bold text-coral-dark">
            Allergies: {report.patient.allergies}
          </p>
        )}
      </DoctorCard>

      <DoctorCard title="Results" description="Entered and verified by the laboratory.">
        {parameters.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-deept/12 text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-3 font-bold">Parameter</th>
                  <th className="px-3 py-2 font-bold">Value</th>
                  <th className="px-3 py-2 font-bold">Reference range</th>
                  <th className="py-2 pl-3 font-bold">Flag</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((parameter, index) => (
                  <tr key={`${parameter.parameter}-${index}`} className="border-b border-deept/8 last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-ink">{parameter.parameter}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-teal-deep">
                      {parameter.value ?? "-"} {parameter.unit || ""}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{parameter.referenceRange || "-"}</td>
                    <td className="py-2.5 pl-3">
                      <FlagChip flag={parameter.flag} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-deept/20 px-4 py-8 text-center text-sm text-ink-soft">
            No result values have been entered on this report yet.
          </p>
        )}

        {report.remarks && (
          <div className="mt-4 rounded-2xl bg-teal-pale/60 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Laboratory remarks</p>
            <p className="whitespace-pre-wrap text-sm text-ink">{report.remarks}</p>
          </div>
        )}
      </DoctorCard>

      <DoctorCard
        title="Compare with an earlier report"
        description="Same patient, same test. Pick a report to see the movement."
      >
        {!history.length ? (
          <p className="rounded-xl border border-dashed border-deept/20 px-4 py-8 text-center text-sm text-ink-soft">
            No earlier report of this test exists for this patient, so there is nothing to compare against.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label htmlFor="compare-with" className={LABEL_CLASS}>
                  Earlier report
                </label>
                <select id="compare-with" value={compareWith} onChange={(event) => runCompare(event.target.value)} className={FIELD_CLASS}>
                  <option value="">Most recent verified report</option>
                  {history
                    .filter((item) => item.id !== report._id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatDate(item.generatedAt)} · {item.reportId}
                      </option>
                    ))}
                </select>
              </div>
              <button type="button" onClick={() => runCompare(compareWith)} className={SECONDARY_BUTTON}>
                <ArrowLeftRight className="size-4" /> Compare
              </button>
            </div>

            {comparison && (
              <div className="overflow-x-auto">
                <p className="mb-3 text-xs text-ink-soft">
                  {comparison.current?.test} on {formatDate(comparison.current?.generatedAt)}
                  {comparison.previous ? ` compared with ${formatDate(comparison.previous.generatedAt)}` : " — no earlier report to compare with"}
                </p>
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-deept/12 text-xs uppercase tracking-wide text-ink-soft">
                      <th className="py-2 pr-3 font-bold">Parameter</th>
                      <th className="px-3 py-2 font-bold">Previous</th>
                      <th className="px-3 py-2 font-bold">Current</th>
                      <th className="py-2 pl-3 font-bold">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(comparison.rows || []).map((row, index) => (
                      <tr key={`${row.parameter}-${index}`} className="border-b border-deept/8 last:border-0">
                        <td className="py-2.5 pr-3 font-semibold text-ink">{row.parameter}</td>
                        <td className="px-3 py-2.5 font-mono text-ink-soft">
                          {row.previous ? `${row.previous.value} ${row.previous.unit || ""}` : "-"}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-teal-deep">
                          {row.current ? `${row.current.value} ${row.current.unit || ""}` : "-"}
                        </td>
                        <td className="py-2.5 pl-3">
                          {!row.current ? (
                            <span className="text-xs text-ink-soft">Not tested now</span>
                          ) : !row.previous ? (
                            <span className="text-xs text-ink-soft">New</span>
                          ) : !row.changed ? (
                            <span className="text-xs font-bold text-ink-soft">Unchanged</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-coral-dark">
                              {String(row.current.value) > String(row.previous.value) ? (
                                <TrendingUp className="size-3.5" />
                              ) : (
                                <TrendingDown className="size-3.5" />
                              )}
                              {String(row.current.value) > String(row.previous.value) ? "Rose" : "Fell"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DoctorCard>

      <DoctorCard
        title="Your review"
        description={alreadyReviewed ? "You have already reviewed this report. Add another note if needed." : "Your comment is what the patient sees on their report."}
      >
        {(report.doctorComments || []).length > 0 && (
          <ul className="mb-5 space-y-3">
            {report.doctorComments.map((entry, index) => (
              <li key={index} className="rounded-2xl border border-deept/12 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-ink">{entry.doctor?.name || "Doctor"}</p>
                  <p className="text-xs text-ink-soft">{formatDate(entry.createdAt)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{entry.comment}</p>
                {entry.interpretation && (
                  <p className="mt-2 text-sm text-ink-soft"><span className="font-bold">Interpretation:</span> {entry.interpretation}</p>
                )}
                {entry.treatmentDecision && (
                  <p className="mt-1 text-sm text-ink-soft"><span className="font-bold">Treatment decision:</span> {entry.treatmentDecision}</p>
                )}
                {entry.outcome && (
                  <p className="mt-1 text-sm text-ink-soft"><span className="font-bold">Outcome:</span> {entry.outcome}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {report.status !== "VERIFIED" ? (
          <p className="rounded-xl border border-deept/12 bg-deept/3 px-4 py-3 text-sm text-ink-soft">
            A report can only be reviewed once the laboratory has verified it. This one is {humanise(report.status).toLowerCase()}.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="report-comment" className={LABEL_CLASS}>
                Comment <span className="text-coral-dark">*</span>
              </label>
              <textarea
                id="report-comment"
                rows={3}
                maxLength={2000}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setCommentError("");
                }}
                placeholder="What this result means for the patient..."
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-teal-mid ${commentError ? "border-coral" : "border-deept/15 bg-white"}`}
              />
              {commentError && <p className="mt-1 text-xs font-bold text-coral-dark">{commentError}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["interpretation", "Clinical interpretation"],
                ["treatmentDecision", "Treatment decision"],
                ["outcome", "Outcome"],
              ].map(([field, label]) => (
                <div key={field}>
                  <label htmlFor={`report-${field}`} className={LABEL_CLASS}>
                    {label}
                  </label>
                  <textarea
                    id={`report-${field}`}
                    rows={2}
                    maxLength={2000}
                    value={field === "interpretation" ? interpretation : field === "treatmentDecision" ? treatmentDecision : outcome}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (field === "interpretation") setInterpretation(value);
                      else if (field === "treatmentDecision") setTreatmentDecision(value);
                      else setOutcome(value);
                    }}
                    className="w-full rounded-xl border border-deept/15 bg-white px-3 py-2 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                  />
                </div>
              ))}
            </div>

            <button type="button" onClick={submitComment} disabled={saving} className={PRIMARY_BUTTON}>
              <MessageSquarePlus className="size-4" />
              {saving ? "Saving..." : "Save review"}
            </button>
          </div>
        )}
      </DoctorCard>
    </>
  );
}

export default function DoctorLaboratoryReports() {
  const [params] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reviewed, setReviewed] = useState(params.get("reviewed") || "");
  const [patientFilter, setPatientFilter] = useState(params.get("patient") || "");
  const [openId, setOpenId] = useState(params.get("report") || "");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorApi.getReports({
        limit: 100,
        ...(reviewed ? { reviewed } : {}),
        ...(patientFilter ? { patient: patientFilter } : {}),
        ...(search.trim().length >= 2 ? { search: search.trim() } : {}),
      });
      setReports(result.items);
      setPagination(result.pagination);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [reviewed, patientFilter, search]);

  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_VERIFIED, load);
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_APPROVED, load);
  useSocketEvent(SOCKET_EVENTS.LAB_REPORT_REVISED, load);
  useSocketEvent("connect", load);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <DoctorPageShell
      title="Laboratory Reports"
      description="Verified reports from your patients. Read them, compare them over time, and record your review."
      actions={
        <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      {openId ? (
        <div className="space-y-6">
          <button type="button" onClick={() => setOpenId("")} className={CHIP_BUTTON}>
            ← Back to all reports
          </button>
          <ReportDetail reportId={openId} onChanged={load} onClose={() => setOpenId("")} />
        </div>
      ) : (
        <DoctorCard
          title="Reports"
          description={loading ? "Loading reports..." : pagination ? `${pagination.total} report(s)` : `${reports.length} shown`}
        >
          <div className="mb-5 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by patient or test..."
                aria-label="Search reports"
                className={`${FIELD_CLASS} pl-9`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["", "All"],
                ["false", "Awaiting my review"],
                ["true", "Reviewed by me"],
              ].map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setReviewed(value)}
                  className={
                    reviewed === value
                      ? "rounded-full bg-teal-deep px-3 py-1.5 text-xs font-bold text-white"
                      : "rounded-full border border-deept/15 bg-white px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
                  }
                >
                  {label}
                </button>
              ))}
              {patientFilter && (
                <button type="button" onClick={() => setPatientFilter("")} className="rounded-full bg-teal-mid/15 px-3 py-1.5 text-xs font-bold text-teal-mid">
                  This patient ×
                </button>
              )}
            </div>
          </div>

          <DoctorResponsiveList
            rows={reports}
            loading={loading}
            error={error}
            empty={!reports.length}
            emptyMessage="No verified reports for your patients yet. They appear here as soon as the laboratory verifies one."
            columns={[
              {
                header: "Report",
                primary: true,
                render: (item) => (
                  <>
                    <p className="font-mono text-xs font-bold text-teal-mid">{item.reportId}</p>
                    <p className="text-xs text-ink-soft">{formatDate(item.verifiedAt || item.generatedAt)}</p>
                  </>
                ),
              },
              {
                header: "Test",
                render: (item) => (
                  <>
                    <p className="font-semibold text-ink">{item.test?.name || item.test?.testName}</p>
                    <p className="text-xs text-ink-soft">{item.test?.category}</p>
                  </>
                ),
              },
              { header: "Patient", render: (item) => <span className="text-ink-soft">{item.patient?.name || "Patient"}</span> },
              { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
              {
                header: "Review",
                render: (item) =>
                  item.reviewed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-mid">
                      <CheckCircle2 className="size-3.5" /> Reviewed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-coral-dark">
                      <FlaskConical className="size-3.5" /> Pending
                    </span>
                  ),
              },
            ]}
            actions={(item) => (
              <button type="button" onClick={() => setOpenId(item._id)} className={CHIP_PRIMARY}>
                Review
              </button>
            )}
          />
        </DoctorCard>
      )}

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
