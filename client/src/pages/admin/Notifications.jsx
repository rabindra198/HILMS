import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDateTime } from "@/lib/format";

/**
 * The signed-in administrator's own notification inbox.
 *
 * Every query here is already scoped to `{ recipient: adminUser._id }` on the
 * server, so nothing on this page can widen what it reads.
 *
 * `unread` in the list response is the recipient's TOTAL unread count, not the
 * count matching the current filter. The badge therefore shows the true number
 * even while "Unread only" is active - which is what you want from a badge, but
 * it means the two numbers cannot be compared.
 */

const PAGE_SIZE = 20;

const emptyPagination = { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE };

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getNotifications({
        page,
        limit: PAGE_SIZE,
        unread: unreadOnly ? "true" : undefined,
      });
      setItems(result.items || []);
      setUnread(result.unread ?? 0);
      setPagination(result.pagination || emptyPagination);
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load notifications."));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Reading the last unread item while "Unread only" is on would otherwise leave
  // the table empty on a page that still exists.
  useEffect(() => {
    if (!loading && items.length === 0 && pagination.total > 0 && page > 1) setPage(page - 1);
  }, [loading, items.length, pagination.total, page]);

  const markRead = async (notification) => {
    setMarkingId(notification._id);
    try {
      await markNotificationRead(notification._id);
      // Re-fetch rather than patching local state: the server is the source of
      // truth for both the item and the badge total.
      await load();
    } catch (markError) {
      toast.error(getErrorMessage(markError, "Unable to mark this notification as read."));
    } finally {
      setMarkingId(null);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const result = await markAllNotificationsRead();
      toast.success(
        result?.updated ? `${result.updated} notification${result.updated === 1 ? "" : "s"} marked as read.` : "Nothing left to mark as read."
      );
      await load();
    } catch (markAllError) {
      toast.error(getErrorMessage(markAllError, "Unable to mark notifications as read."));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Notifications</h1>
          <p className="text-base font-medium text-ink-soft">
            {unread > 0
              ? `${unread} unread notification${unread === 1 ? "" : "s"}.`
              : "You are all caught up."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly((current) => !current);
              setPage(1);
            }}
            className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
              unreadOnly ? "border-teal-mid bg-softteal text-teal-deep" : "border-deept/15 bg-white text-teal-deep hover:border-teal-pale"
            }`}
          >
            {unreadOnly ? <BellOff className="size-4" /> : <Bell className="size-4" />}
            {unreadOnly ? "Showing unread" : "Unread only"}
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll || unread === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-deep px-4 text-sm font-semibold text-white transition hover:bg-teal-mid disabled:opacity-50"
          >
            <CheckCheck className="size-4" />
            {markingAll ? "Marking..." : "Mark all read"}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Refresh notifications"
            title="Refresh notifications"
            className="inline-flex size-11 items-center justify-center rounded-xl border border-deept/15 bg-white text-teal-deep transition hover:border-teal-pale disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
        {loading ? (
          <div className="p-5">
            <LoadingSkeleton rows={6} columns={2} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Could not load notifications" description={error} onRetry={load} />
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Bell className="mx-auto size-8 text-ink-soft/50" />
            <p className="mt-3 text-sm font-semibold text-ink">
              {unreadOnly ? "Nothing unread" : "No notifications yet"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {unreadOnly ? "You have read everything." : "Administrative alerts will appear here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-deept/5">
            {items.map((notification) => {
              const isRead = Boolean(notification.readAt);
              return (
                <li
                  key={notification._id}
                  className={`flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-start ${
                    isRead ? "bg-white" : "bg-teal-pale/30"
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-coral"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm ${isRead ? "font-medium text-ink-soft" : "font-bold text-ink"}`}>
                        {notification.title}
                      </p>
                      {notification.type && <StatusBadge status={notification.type} />}
                    </div>
                    {notification.message && (
                      <p className="mt-1 text-sm text-ink-soft">{notification.message}</p>
                    )}
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {formatDateTime(notification.createdAt)}
                      {isRead ? ` · read ${formatDateTime(notification.readAt)}` : ""}
                    </p>
                  </div>
                  {!isRead && (
                    <button
                      type="button"
                      onClick={() => markRead(notification)}
                      disabled={markingId === notification._id}
                      className="self-start rounded-full border border-teal/30 px-3 py-1.5 text-xs font-bold text-teal-mid transition hover:bg-teal-pale disabled:opacity-50"
                    >
                      {markingId === notification._id ? "Marking..." : "Mark as read"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-deept/10 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-soft">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} matching
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={pagination.page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-deept/15 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-deept/15 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}