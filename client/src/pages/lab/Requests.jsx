import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabResponsiveList, LabTrustNote } from "./LabPageShell";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

const STATUS_OPTIONS = ["PENDING", "ACCEPTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED", "VERIFIED", "CANCELLED"];
const PRIORITY_OPTIONS = ["ROUTINE", "URGENT", "STAT"];

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const fieldClass = "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";

export default function RequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  // The dashboard deep-links into this queue with a pre-set priority filter.
  useEffect(() => {
    const requested = searchParams.get("priority");
    if (requested) setPriority(requested.toUpperCase());
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { limit: 0 };
      if (search.trim().length >= 2) params.search = search.trim();
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setRequests(await laboratoryApi.getRequests(params));
    } catch (loadError) {
      const message = getApiError(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [search, status, priority, dateFrom, dateTo]);

  useSocketEvent(SOCKET_EVENTS.LAB_REQUEST_CREATED, load);
  useSocketEvent("connect", load);

  // Searching happens on the server, so it is debounced instead of filtering a
  // stale in-memory list that only holds the first page.
  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setPriority("");
    setDateFrom("");
    setDateTo("");
    setSearchParams({});
  };

  const runAction = async (item, action) => {
    setBusyId(item._id);
    try {
      if (action === "accept") {
        await laboratoryApi.acceptRequest(item._id);
        toast.success("Request accepted");
      } else if (action === "cancel") {
        await laboratoryApi.updateRequestStatus(item._id, "CANCELLED");
        toast.success("Request cancelled");
      }
      await load();
    } catch (actionError) {
      toast.error(getApiError(actionError));
    } finally {
      setBusyId(null);
    }
  };

  const hasFilters = Boolean(search || status || priority || dateFrom || dateTo);

  return (
    <LabPageShell
      title="Lab requests"
      description="Review, prioritize and advance laboratory requests through the verified workflow."
      actions={
        <>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="Requested from"
            className="h-10 rounded-xl border border-deept/15 bg-white px-3 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            aria-label="Requested to"
            className="h-10 rounded-xl border border-deept/15 bg-white px-3 text-sm"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </>
      }
    >
      <LabCard
        title="Request queue"
        description={loading ? "Loading requests..." : `${requests.length} ${requests.length === 1 ? "request" : "requests"} match the current filters.`}
        action={
          hasFilters ? (
            <button type="button" onClick={clearFilters} className="text-sm font-bold text-teal-mid underline underline-offset-4">
              Clear filters
            </button>
          ) : null
        }
      >
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, test, clinical notes or request ID..."
              aria-label="Search requests"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className={fieldClass}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority" className={fieldClass}>
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <LabResponsiveList
          rows={requests}
          loading={loading}
          error={error}
          empty={!requests.length}
          emptyMessage={hasFilters ? "No requests match these filters." : "No laboratory requests have been raised yet."}
          columns={[
            {
              header: "Request",
              primary: true,
              render: (item) => (
                <>
                  <p className="font-semibold text-ink">{item.test?.name || item.test?.testName || "Laboratory test"}</p>
                  <p className="font-mono text-xs text-teal-mid">{String(item._id).slice(-8).toUpperCase()}</p>
                </>
              ),
            },
            { header: "Patient", render: (item) => <span className="font-medium text-ink">{item.patient?.name || "Patient"}</span> },
            { header: "Doctor", render: (item) => <span className="text-ink-soft">{item.doctor?.name || "Doctor"}</span> },
            // Truncated in the table only; on a card the notes wrap instead of
            // hiding behind a hover title that phones do not have.
            { header: "Clinical notes", hideOnMobile: true, render: (item) => <span className="block max-w-[220px] truncate text-ink-soft" title={item.clinicalNotes || ""}>{item.clinicalNotes || "-"}</span> },
            { header: "Priority", render: (item) => <StatusBadge status={item.priority || "ROUTINE"} /> },
            { header: "Requested", render: (item) => <span className="text-ink-soft">{formatDate(item.requestedDate)}</span> },
            { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
          ]}
          actions={(item) => {
            const currentStatus = String(item.status || "").toUpperCase();
            return (
              <>
                {currentStatus === "PENDING" && (
                  <>
                    <button
                      type="button"
                      disabled={busyId === item._id}
                      onClick={() => runAction(item, "accept")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
                    >
                      {busyId === item._id ? "Accepting..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item._id}
                      onClick={() => {
                        if (window.confirm("Are you sure you want to cancel this laboratory request?")) {
                          runAction(item, "cancel");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-coral/40 px-3 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {currentStatus === "ACCEPTED" && (
                  <Link
                    to={`/lab/samples?request=${item._id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-2 text-xs font-bold text-white transition hover:bg-teal-mid"
                  >
                    Collect sample
                  </Link>
                )}
              </>
            );
          }}
        />
      </LabCard>

      <LabTrustNote />
    </LabPageShell>
  );
}
