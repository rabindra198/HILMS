import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  FlaskConical,
  RefreshCw,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabResponsiveList, LabTableState, LabTrustNote } from "./LabPageShell";

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function LabDashboardContent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await laboratoryApi.getDashboard());
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

  const count = (key) => (loading ? "..." : (data?.[key] ?? 0));
  const activeRequests = data?.activeRequests || [];
  const recentSamples = data?.recentSamples || [];
  const recentRequests = data?.recentRequests || [];
  const recentReports = data?.recentReports || [];

  return (
    <LabPageShell
      title="Laboratory dashboard"
      description="Live queue, specimen and report activity across the laboratory workflow."
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Pending requests" value={count("pendingRequests")} description="Awaiting acceptance" icon={Clock3} variant="sand" />
        <StatCard title="Accepted" value={count("acceptedRequests")} description="Awaiting sample" icon={FileText} variant="lavender" />
        <StatCard title="Samples collected" value={count("samplesCollected")} description="Ready for processing" icon={FlaskConical} variant="teal" />
        <StatCard title="In processing" value={count("processingTests")} description="On the bench" icon={ScanLine} variant="lavender" />
        <StatCard title="Awaiting verification" value={count("reportsAwaitingVerification")} description="Generated, not released" icon={Activity} variant="sand" />
        <StatCard title="Verified reports" value={count("verifiedReports")} description="Released to care teams" icon={CheckCircle2} variant="teal" />
      </div>

      {Number(data?.urgentRequests || 0) > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-coral/40 bg-coral-pale px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-coral-dark">
            <AlertTriangle className="size-4 shrink-0" />
            {data.urgentRequests} urgent or STAT {data.urgentRequests === 1 ? "request is" : "requests are"} still open.
          </p>
          <Link to="/lab/requests?priority=URGENT" className="text-sm font-bold text-coral-dark underline underline-offset-4">
            Review urgent queue
          </Link>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <LabCard
          title="Active queue"
          description="Open work ordered by urgency, then by how long it has waited."
          action={<Link to="/lab/requests" className="text-sm font-bold text-teal-mid">All requests</Link>}
        >
          <LabResponsiveList
            rows={activeRequests}
            loading={loading}
            error={error}
            empty={!activeRequests.length}
            emptyMessage="No open requests. New work appears here automatically."
            columns={[
              { header: "Patient", primary: true, render: (request) => <span className="font-semibold text-ink">{request.patient?.name || "Patient"}</span> },
              { header: "Test", render: (request) => <span className="text-ink-soft">{request.test?.name || request.test?.testName || "Laboratory test"}</span> },
              { header: "Priority", render: (request) => <StatusBadge status={request.priority || "ROUTINE"} /> },
              { header: "Status", render: (request) => <StatusBadge status={request.status} /> },
            ]}
          />
        </LabCard>

        <LabCard
          title="Recent samples"
          description="Most recently collected specimens."
          action={<Link to="/lab/samples" className="text-sm font-bold text-teal-mid">All samples</Link>}
        >
          <LabResponsiveList
            rows={recentSamples}
            loading={loading}
            error={error}
            empty={!recentSamples.length}
            emptyMessage="No samples have been collected yet."
            columns={[
              { header: "Sample", primary: true, render: (sample) => <span className="font-mono text-xs font-semibold text-teal-mid">{sample.sampleId}</span> },
              { header: "Patient", render: (sample) => <span className="font-semibold text-ink">{sample.patient?.name || "Patient"}</span> },
              { header: "Collected", render: (sample) => <span className="text-ink-soft">{formatDateTime(sample.collectionTime || sample.collectionDate)}</span> },
              { header: "Status", render: (sample) => <StatusBadge status={sample.status} /> },
            ]}
          />
        </LabCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <LabCard
          title="Latest requests"
          description="Newest requests from doctors across the hospital."
          action={<Link to="/lab/requests" className="text-sm font-bold text-teal-mid">Open queue</Link>}
        >
          <div className="space-y-3">
            <LabTableState
              as="div"
              loading={loading}
              error={error}
              empty={!recentRequests.length}
              emptyMessage="No requests have been raised yet."
            />
            {!loading && !error && recentRequests.map((request) => (
              <div key={request._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-deept/10 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{request.test?.name || request.test?.testName || "Laboratory test"}</p>
                  <p className="truncate text-sm text-ink-soft">
                    {request.patient?.name || "Patient"} &middot; {request.doctor?.name || "Doctor"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={request.priority || "ROUTINE"} />
                  <StatusBadge status={request.status} />
                </div>
              </div>
            ))}
          </div>
        </LabCard>

        <LabCard
          title="Latest reports"
          description="Generated and verified laboratory output."
          action={<Link to="/lab/reports" className="text-sm font-bold text-teal-mid">All reports</Link>}
        >
          <div className="space-y-3">
            <LabTableState
              as="div"
              loading={loading}
              error={error}
              empty={!recentReports.length}
              emptyMessage="No reports have been generated yet."
            />
            {!loading && !error && recentReports.map((report) => (
              <div key={report._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-deept/10 p-4">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-teal-mid">{report.reportId}</p>
                  <p className="truncate text-sm text-ink-soft">
                    {report.test?.name || report.test?.testName || "Laboratory test"} &middot; {report.patient?.name || "Patient"}
                  </p>
                </div>
                <StatusBadge status={report.status} />
              </div>
            ))}
          </div>
        </LabCard>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/lab/requests" className="inline-flex items-center gap-2 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-mid">
          <FileText className="size-4" /> Review requests
        </Link>
        <Link to="/lab/samples" className="inline-flex items-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
          <FlaskConical className="size-4" /> Record a sample
        </Link>
        <Link to="/lab/processing" className="inline-flex items-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
          <ScanLine className="size-4" /> Processing bench
        </Link>
        <Link to="/lab/reports" className="inline-flex items-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
          <ShieldCheck className="size-4" /> Verify reports
        </Link>
      </div>

      <LabTrustNote />
    </LabPageShell>
  );
}
