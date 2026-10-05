import { useCallback, useEffect, useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { notifyNotificationsChanged } from "@/lib/notifications";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
import { LabCard, LabPageShell, LabTableState, LabTrustNote } from "./LabPageShell";

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await laboratoryApi.getNotifications({ limit: 0, ...(unreadOnly ? { unread: "true" } : {}) }));
    } catch (loadError) {
      const message = getApiError(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION_CREATED, load);
  useSocketEvent("connect", load);

  const read = async (id) => {
    setBusyId(id);
    try {
      await laboratoryApi.markNotificationRead(id);
      notifyNotificationsChanged();
      await load();
    } catch (readError) {
      toast.error(getApiError(readError));
    } finally {
      setBusyId(null);
    }
  };

  const readAll = async () => {
    try {
      setItems(await laboratoryApi.markAllNotificationsRead());
      notifyNotificationsChanged();
      toast.success("All notifications marked as read");
    } catch (readAllError) {
      toast.error(getApiError(readAllError));
    }
  };

  const unread = items.filter((item) => !item.readAt).length;

  return (
    <LabPageShell
      title="Notifications"
      description="Stay on top of requests, samples and report activity."
      actions={
        <>
          <button
            type="button"
            onClick={() => setUnreadOnly((current) => !current)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              unreadOnly ? "border-teal-deep bg-teal-deep text-white" : "border-deept/15 bg-white text-teal-deep hover:bg-teal-pale"
            }`}
          >
            {unreadOnly ? "Showing unread" : "Unread only"}
          </button>
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
        title="Recent updates"
        description={loading ? "Loading notifications..." : unread ? `${unread} unread update${unread === 1 ? "" : "s"}.` : "You are all caught up."}
        action={unread > 0 ? (
          <button type="button" onClick={readAll} className="text-sm font-bold text-teal-mid underline underline-offset-4">
            Mark all read
          </button>
        ) : null}
      >
        <div className="space-y-3">
          <LabTableState
            as="div"
            loading={loading}
            error={error}
            empty={!items.length}
            emptyMessage={unreadOnly ? "You have no unread notifications." : "No notifications yet."}
          />
          {!loading && !error && items.map((item) => (
            <div
              key={item._id}
            className={`flex items-start gap-3 rounded-xl border p-4 sm:gap-4 ${item.readAt ? "border-deept/10" : "border-teal-mid/30 bg-teal-pale/40"}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-pale text-teal-mid">
                <Bell className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">{item.message}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {formatDateTime(item.createdAt)} &middot; {item.readAt ? "Read" : "Unread"}
                </p>
              </div>
              {!item.readAt && (
                <button
                  type="button"
                  aria-label={`Mark "${item.title}" as read`}
                  disabled={busyId === item._id}
                  onClick={() => read(item._id)}
                  className="shrink-0 rounded-lg p-1 text-teal-mid transition hover:bg-teal-pale hover:text-teal-deep disabled:opacity-50"
                >
                  <Check className="size-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </LabCard>

      <LabTrustNote />
    </LabPageShell>
  );
}
