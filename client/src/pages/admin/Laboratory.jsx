import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FlaskConical,
  Info,
  RefreshCw,
  Search,
} from "lucide-react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getLaboratoryOverview } from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDateTime } from "@/lib/format";

/**
 * Administrative laboratory overview (FR-AD-06, oversight only).
 *
 * `GET /admin/laboratory` is the ONLY laboratory endpoint an admin can reach: the
 * laboratory router is mounted behind `authorize(ROLES.LABORATORY)`, so an admin
 * token is rejected there with a 403 before any controller runs. Everything below
 * is therefore an oversight snapshot - read-only, hospital-wide, unscoped - and
 * the page deliberately does not pretend to be a working queue.
 *
 * Two consequences worth stating plainly rather than hiding:
 *
 *  1. There is no server-side filter, search, or pagination here. The service
 *     returns counts plus small "most recent" slices, so the search box below
 *     filters those slices in the browser and is labelled as doing exactly that.
 *  2. `unreadNotifications` is deliberately not displayed. The controller calls
 *     `labService.getDashboard()` with no user id, which makes that counter
 *     resolve to 0 for every admin request - showing it would be a permanently
 *     dead figure that reads like "you have no notifications".
 *
 * Request acceptance, status transitions and report verification stay with the
 * laboratory staff who own them; `LabRequest` has no assignee field, so an admin
 * cannot be given work to hand out.
 */

const STATS = [
  {
    key: "pendingRequests",
    title: "Pending requests",
    icon: Clock,
    tile: "bg-teal-pale",
    iconTile: "bg-teal-mid/20 text-teal-mid",
  },
  {
    key: "acceptedRequests",
    title: "Accepted",
    icon: ClipboardCheck,
    tile: "bg-softteal",
    iconTile: "bg-teal-mid/15 text-teal-mid",
  },
  {
    key: "processingTests",
    title: "Processing",
    icon: Activity,
    tile: "bg-lavender-pale",
    iconTile: "bg-lavender/30 text-lavender",
  },
  {
    key: "verifiedReports",
    title: "Verified reports",
    icon: CheckCircle2,
    tile: "bg-teal-pale",
    iconTile: "bg-teal-mid/15 text-teal-mid",
  },
];

const SECONARY_STATS = [
  { key: "urgentRequests", title: "Urgent in progress", tone: "text-coral-dark" },
  { key: "reportsAwaitingVerification", title: "Reports awaiting verification", tone: "text-coral-dark" },
  { key: "samplesCollected", title: "Samples collected", tone: "text-ink" },
  { key: "completedTests", title: "Completed tests", tone: "text-ink" },
];

const shortId = (value) => String(value ?? "").slice(-8).toUpperCase();

const testName = (test) => test?.name || test?.testName || "Laboratory test";

/** Client-side match over a returned slice; the server does not support this. */
const matches = (term, request) =>
  [
    request?._id,
    request?.patient?.name,
    request?.patient?.email,
    testName(request?.test),
    request?.test?.testCode,
    request?.doctor?.name,
    request?.priority,
    request?.status,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));

export default function LaboratoryPage() {
  const [overview, setOverview] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOverview(await getLaboratoryOverview());
    } catch (loadError) {
      const message = getErrorMessage(loadError, "Unable to load laboratory activity.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const recentRequests = useMemo(() => overview?.recentRequests || [], [overview]);
  const activeRequests = useMemo(() => overview?.activeRequests || [], [overview]);
  const recentSamples = useMemo(() => overview?.recentSamples || [], [overview]);
  const recentReports = useMemo(() => overview?.recentReports || [], [overview]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return recentRequests;
    return recentRequests.filter((request) => matches(term, request));
  }, [recentRequests, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Laboratory</h1>
          <p className="mt-1 text-base font-medium text-ink-soft">
            Hospital-wide laboratory activity. Oversight only - results are released by laboratory staff.
          </p>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-teal/20 bg-teal-pale/60 p-4 text-sm text-ink">
        <Info className="mt-0.5 size-4 shrink-0 text-teal-mid" />
        <p>
          This is a live snapshot of the latest activity, not a filterable queue. Administrative accounts
          cannot accept requests, change statuses, or verify reports - those actions belong to laboratory
          staff.
        </p>
      </div>

      {loading ? (
        <LoadingSkeleton rows={6} columns={5} />
      ) : error ? (
        <ErrorState title="Could not load laboratory activity" description={error} onRetry={loadOverview} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map(({ key, title, icon: Icon, tile, iconTile }) => (
              <div key={key} className={`rounded-2xl border border-deept/5 ${tile} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-soft">{title}</p>
                    <p className="font-heading text-2xl font-bold text-teal-deep">{overview?.[key] ?? 0}</p>
                  </div>
                  <span className={`flex size-10 items-center justify-center rounded-xl ${iconTile}`}>
                    <Icon className="size-5" />
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {SECONARY_STATS.map(({ key, title, tone }) => (
              <div key={key} className="rounded-2xl border border-deept/10 bg-white p-4">
                <p className="text-xs font-medium text-ink-soft">{title}</p>
                <p className={`mt-1 font-heading text-lg font-bold ${tone}`}>{overview?.[key] ?? 0}</p>
              </div>
            ))}
          </div>

          {activeRequests.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
              <div className="border-b border-deept/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-coral-dark" />
                  <h2 className="font-heading text-lg font-bold text-teal-deep">Work in progress</h2>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  Oldest first within each priority group, urgent at the top.
                </p>
              </div>
              <ul className="divide-y divide-deept/5">
                {activeRequests.map((request) => (
                  <li key={request._id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
                    <span className="font-mono text-xs font-semibold text-teal-mid">{shortId(request._id)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {request.patient?.name || "Patient"}
                    </span>
                    <span className="truncate text-sm text-ink-soft">{testName(request.test)}</span>
                    <StatusBadge status={request.priority || "Routine"} />
                    <StatusBadge status={request.status || "Pending"} />
                    <span className="w-full text-xs text-ink-soft sm:w-auto">
                      {request.requestedDate ? formatDateTime(request.requestedDate) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-deept/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-xl font-bold text-teal-deep">Recent laboratory requests</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {search.trim()
                    ? `${filteredRequests.length} of the ${recentRequests.length} most recent requests match.`
                    : `The ${recentRequests.length} most recent requests.`}
                </p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search these recent requests"
                  className="h-10 w-full rounded-xl border border-deept/15 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b-2 border-deept/10 bg-softteal/50">
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Request</th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Test</th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Doctor</th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Priority</th>
                    <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deept/5">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm text-ink-soft">
                        {search.trim() ? "No requests in this recent batch match your search." : "No laboratory requests found."}
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((request) => (
                      <tr key={request._id} className="transition-colors hover:bg-teal-pale/30">
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{shortId(request._id)}</td>
                        <td className="px-5 py-4 font-semibold text-ink">{request.patient?.name || "Patient"}</td>
                        <td className="px-5 py-4 text-ink-soft">{testName(request.test)}</td>
                        <td className="px-5 py-4 text-ink-soft">{request.doctor?.name || "—"}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={request.priority || "Routine"} />
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={request.status || "Pending"} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
              <div className="border-b border-deept/10 px-5 py-4">
                <h2 className="font-heading text-lg font-bold text-teal-deep">Recent samples</h2>
                <p className="mt-1 text-sm text-ink-soft">Collections recorded by laboratory staff.</p>
              </div>
              {recentSamples.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-soft">No samples recorded.</p>
              ) : (
                <ul className="divide-y divide-deept/5">
                  {recentSamples.map((sample) => (
                    <li key={sample._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                      <span className="font-mono text-xs font-semibold text-teal-mid">{shortId(sample._id)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                        {sample.patient?.name || "Patient"}
                      </span>
                      <span className="truncate text-sm text-ink-soft">{testName(sample.test)}</span>
                      <StatusBadge status={sample.status || "Collected"} />
                      <span className="w-full text-xs text-ink-soft sm:w-auto">
                        {formatDateTime(sample.collectionDate || sample.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
              <div className="border-b border-deept/10 px-5 py-4">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="size-4 text-teal-mid" />
                  <h2 className="font-heading text-lg font-bold text-teal-deep">Recent reports</h2>
                </div>
                <p className="mt-1 text-sm text-ink-soft">Issued and verified laboratory output.</p>
              </div>
              {recentReports.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-ink-soft">No reports issued.</p>
              ) : (
                <ul className="divide-y divide-deept/5">
                  {recentReports.map((report) => (
                    <li key={report._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                      <span className="font-mono text-xs font-semibold text-teal-mid">{shortId(report._id)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                        {report.patient?.name || "Patient"}
                      </span>
                      <span className="truncate text-sm text-ink-soft">{testName(report.test)}</span>
                      <StatusBadge status={report.status || "Pending"} />
                      <span className="w-full text-xs text-ink-soft sm:w-auto">{formatDateTime(report.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}