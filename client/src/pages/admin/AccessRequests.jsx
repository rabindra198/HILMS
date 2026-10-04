import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search,
  UserPlus,
  Check,
  X,
  Clock,
  ShieldCheck,
  RefreshCw,
  Inbox,
  Mail,
  Phone,
  MapPin,
  FlaskConical,
  Eye,
  Stethoscope,
} from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Modal } from "@/components/common/Modal";
import {
  getAccessRequests,
  getAccessRequest,
  getAccessRequestSummary,
  approveAccessRequest,
  rejectAccessRequest,
} from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";

const STATUS_FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "", label: "All" },
];

const DetailRow = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 border-b border-lavender/40 py-2.5 last:border-0">
    <Icon className="mt-0.5 size-4 shrink-0 text-lavender" />
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="break-words text-sm font-semibold text-deept">{value || "—"}</p>
    </div>
  </div>
);

export default function AccessRequests() {
  const [requests, setRequests] = useState([]);
  // Real totals from the server, independent of the active status tab. Deriving
  // these from `requests` would make "Approved" read 0 whenever the PENDING
  // filter is on, which is the default.
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionId, setActionId] = useState(null);
  // View / confirm dialogs
  const [viewing, setViewing] = useState(null);
  const [viewDetail, setViewDetail] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [confirming, setConfirming] = useState(null); // { request, action }
  const [rejectReason, setRejectReason] = useState("");

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAccessRequests({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      });
      setRequests(data?.requests || []);
      // `counts` is scoped to the current filter, so the headline totals come
      // from the unfiltered summary instead.
      try {
        const summary = await getAccessRequestSummary();
        if (summary?.requestsByStatus) setCounts(summary.requestsByStatus);
      } catch {
        // A summary failure must not blank the page; the cards just keep their
        // previous values.
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not load access requests."));
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const timer = setTimeout(loadRequests, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadRequests, search]);

  /**
   * Fetches the full record for the View dialog so the Admin always reviews the
   * authoritative row rather than a cached list entry.
   */
  const openDetails = async (request) => {
    setViewing(request);
    setViewDetail(null);
    setViewLoading(true);
    try {
      setViewDetail(await getAccessRequest(request.id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load this request."));
      setViewing(null);
    } finally {
      setViewLoading(false);
    }
  };

  const askToReview = (request, action) => {
    setRejectReason("");
    setConfirming({ request, action });
  };

  const closeConfirm = () => {
    if (actionId) return;
    setConfirming(null);
  };

  const confirmReview = async () => {
    if (!confirming) return;
    const { request, action } = confirming;
    setActionId(request.id);
    try {
      if (action === "approve") {
        await approveAccessRequest(request.id, "Approved by administrator.");
        toast.success(
          `${request.name} accepted as ${request.requestedRoleLabel}. A temporary password has been emailed.`
        );
      } else {
        await rejectAccessRequest(request.id, rejectReason.trim() || "Request does not meet access requirements.");
        toast.success(`${request.name}'s request declined`);
      }
      setConfirming(null);
      await loadRequests();
    } catch (err) {
      toast.error(getErrorMessage(err, `Could not ${action} this request.`));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Access Requests
          </h1>
          <p className="text-base text-ink-soft font-medium">
            Review pending Doctor and Laboratory access requests. Patients create their own account
            immediately and never appear here.
          </p>
        </div>
        <button
          onClick={loadRequests}
          disabled={isLoading}
          className="inline-flex items-center gap-2 self-start rounded-full border border-deept/15 bg-white px-5 py-2.5 text-sm font-semibold text-teal-deep transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-deept/5 bg-teal-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-mid/20">
              <Clock className="size-5 text-teal-mid" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Awaiting review</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">{counts.PENDING}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-teal-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-mid/15">
              <Check className="size-5 text-teal-mid" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Approved</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">{counts.APPROVED}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-lavender-pale p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender/30">
              <X className="size-5 text-lavender" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-soft">Rejected</p>
              <p className="font-heading text-2xl font-bold text-teal-deep">{counts.REJECTED}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value || "ALL"}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-teal-mid text-white shadow-md shadow-teal-mid/30"
                  : "border border-deept/15 bg-white text-ink-soft hover:border-teal-mid/40 hover:text-teal-mid"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            placeholder="Search name, email, contact, NMC or registry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm text-ink outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20 transition-all"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton rows={4} columns={5} />
      ) : error ? (
        <ErrorState title="Could not load access requests" description={error} onRetry={loadRequests} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon="users"
          title="No access requests"
          description={
            search.trim()
              ? `Nothing matches "${search.trim()}". Try a different name, email, contact or registration number.`
              : statusFilter
                ? `There are no ${statusFilter.toLowerCase()} access requests right now.`
                : "No access requests have been submitted yet."
          }
        />
      ) : (
        <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b-2 border-deept/10 bg-softteal/50">
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Applicant
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Contact
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Credentials
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Requested Role
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Submitted
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Status
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-deept/5">
                {requests.map((request) => (
                  <tr key={request.id} className="transition-colors hover:bg-teal-pale/30">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{request.name}</p>
                      {request.address && (
                        <p className="mt-1 flex max-w-xs items-start gap-1.5 text-xs text-ink-soft">
                          <MapPin className="mt-0.5 size-3 shrink-0" />
                          {request.address}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="flex items-center gap-1.5 text-ink-soft">
                        <Mail className="size-3.5 shrink-0" />
                        {request.email}
                      </p>
                      {request.contactNumber && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
                          <Phone className="size-3 shrink-0" />
                          {request.contactNumber}
                        </p>
                      )}
                    </td>
                    {/* Only the identity field that belongs to the requested
                        role is ever stored, so exactly one shows here. */}
                    <td className="px-5 py-4">
                      {request.nmcNumber ? (
                        <p className="flex items-center gap-1.5 text-ink-soft">
                          <ShieldCheck className="size-3.5 shrink-0 text-teal-mid" />
                          <span className="font-mono text-xs">{request.nmcNumber}</span>
                        </p>
                      ) : request.labRegistryNumber ? (
                        <p className="flex items-center gap-1.5 text-ink-soft">
                          <FlaskConical className="size-3.5 shrink-0 text-teal-mid" />
                          <span className="font-mono text-xs">{request.labRegistryNumber}</span>
                        </p>
                      ) : (
                        <span className="text-xs text-ink-soft">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-lavender-pale px-3 py-1 text-xs font-semibold text-lavender">
                        <UserPlus className="size-3" />
                        {request.requestedRoleLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-ink-soft">
                      {formatDate(request.createdAt, "DD MMM YYYY")}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={request.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openDetails(request)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-lavender/50 px-3.5 py-2 text-xs font-bold text-lavender transition hover:bg-lavender-pale"
                        >
                          <Eye className="size-3.5" />
                          View
                        </button>
                        {request.status === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => askToReview(request, "approve")}
                              disabled={actionId === request.id}
                              className="inline-flex items-center gap-1.5 rounded-full bg-teal-mid px-3.5 py-2 text-xs font-bold text-white transition hover:bg-teal-deep disabled:opacity-60"
                            >
                              <Check className="size-3.5" />
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => askToReview(request, "reject")}
                              disabled={actionId === request.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-coral/40 px-3.5 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale disabled:opacity-60"
                            >
                              <X className="size-3.5" />
                              Decline
                            </button>
                          </>
                        ) : (
                          request.status === "REJECTED" && (
                            <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                              <ShieldCheck className="size-3.5" />
                              No account created
                            </span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Inbox className="size-4" />
          {requests.length} request{requests.length === 1 ? "" : "s"} found
        </p>
      )}

      {/* ---- View dialog: every submitted field for the chosen role ------ */}
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="Access request"
        description={
          viewDetail
            ? `${viewDetail.name} · ${viewDetail.requestedRoleLabel} · submitted ${formatDate(
                viewDetail.requestedAt || viewDetail.createdAt,
                "DD MMM YYYY"
              )}`
            : undefined
        }
        size="lg"
        closeDisabled={viewLoading}
      >
        {viewLoading || !viewDetail ? (
          <LoadingSkeleton rows={5} />
        ) : (
          <div className="flex flex-col gap-1">
            <DetailRow icon={UserPlus} label="Name" value={viewDetail.name} />
            <DetailRow icon={Mail} label="Email" value={viewDetail.email} />
            <DetailRow icon={Stethoscope} label="Requested role" value={viewDetail.requestedRoleLabel} />
            {viewDetail.requestedRole === "doctor" ? (
              <DetailRow icon={Stethoscope} label="NMC number" value={viewDetail.nmcNumber} />
            ) : null}
            {viewDetail.requestedRole === "lab" ? (
              <DetailRow icon={FlaskConical} label="Lab registry number" value={viewDetail.labRegistryNumber} />
            ) : null}
            <DetailRow icon={MapPin} label="Address" value={viewDetail.address} />
            <DetailRow icon={Phone} label="Contact number" value={viewDetail.contactNumber} />
            <DetailRow icon={Clock} label="Status" value={viewDetail.status} />

            {viewDetail.reviewedAt ? (
              <DetailRow
                icon={ShieldCheck}
                label={`Reviewed on ${formatDate(viewDetail.reviewedAt, "DD MMM YYYY")}`}
                value={viewDetail.reviewNotes || "—"}
              />
            ) : null}
            {viewDetail.rejectionReason ? (
              <DetailRow icon={X} label="Rejection reason" value={viewDetail.rejectionReason} />
            ) : null}

            <p className="mt-3 rounded-2xl bg-lavender-pale px-4 py-3 text-xs font-medium text-ink-soft">
              {viewDetail.status === "PENDING"
                ? "No password was submitted with this request. Accepting it creates the account and emails a temporary password."
                : viewDetail.status === "APPROVED"
                  ? "This account was created and a temporary password was emailed. The request is retained as history."
                  : "This request was declined. The record is retained as history and no account was created."}
            </p>
          </div>
        )}
      </Modal>

      {/* ---- Confirmation dialog before approving or declining ----------- */}
      <Modal
        open={Boolean(confirming)}
        onClose={closeConfirm}
        size="sm"
        title={confirming?.action === "approve" ? "Accept this request?" : "Decline this request?"}
        description={
          confirming
            ? confirming.action === "approve"
              ? `A ${confirming.request.requestedRoleLabel} account will be created for ${confirming.request.name} and a temporary password will be emailed to them.`
              : `${confirming.request.name} will be notified. The request is kept in your history and no account is created.`
            : undefined
        }
        closeDisabled={Boolean(actionId)}
        footer={
          <>
            <button
              type="button"
              onClick={closeConfirm}
              disabled={Boolean(actionId)}
              className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReview}
              disabled={Boolean(actionId)}
              className={`rounded-full px-5 py-2 text-sm font-bold text-white transition disabled:opacity-60 ${
                confirming?.action === "approve" ? "bg-teal-mid hover:bg-teal-deep" : "bg-coral hover:bg-coral-dark"
              }`}
            >
              {actionId
                ? "Working…"
                : confirming?.action === "approve"
                  ? "Accept & create account"
                  : "Decline request"}
            </button>
          </>
        }
      >
        {confirming?.action === "reject" ? (
          <div>
            <label htmlFor="reject-reason" className="mb-1.5 block text-sm font-semibold text-deept">
              Reason (optional)
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              maxLength={500}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. NMC registration number could not be verified"
              className="w-full rounded-2xl border border-deept/20 px-4 py-2.5 text-sm outline-none transition focus:border-lavender"
            />
            <p className="mt-1 text-xs text-ink-soft">Stored with the request and visible in your history.</p>
          </div>
        ) : (
          <p className="text-sm font-medium text-ink-soft">
            {confirming?.request?.requestedRole === "doctor"
              ? `NMC number: ${confirming?.request?.nmcNumber || "—"}`
              : `Lab registry number: ${confirming?.request?.labRegistryNumber || "—"}`}
          </p>
        )}
      </Modal>
    </div>
  );
}
