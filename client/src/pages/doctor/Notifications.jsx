import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import { notifyNotificationsChanged } from "@/lib/notifications";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorTrustNote,
  StatusBadge,
  CHIP_BUTTON,
  CHIP_PRIMARY,
  formatDateTime,
} from "./doctorUi";

/**
 * Notifications (SRS 8.1).
 *
 * This page is the only notification surface in the Doctor module. The old
 * per-page header bar repeated the same bell with hardcoded sample entries on
 * top of every screen, which is why it was removed rather than wired up.
 */

/**
 * The endpoint takes two independent booleans, `unread` and `read`. Sending
 * `unread=false` would mean "do not filter", not "show read ones" - so each tab
 * maps to its own parameter instead of reusing one with a flipped value.
 */
const FILTERS = [
  { value: "", label: "All", params: {} },
  { value: "unread", label: "Unread", params: { unread: true } },
  { value: "read", label: "Read", params: { read: true } },
];

export default function DoctorNotifications() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // The endpoint returns `{ items, unreadCount }`. Reading only `data.items`
      // would work by accident today and silently drop the badge the moment the
      // envelope changed, so both are destructured explicitly.
      const active = FILTERS.find((option) => option.value === filter);
      const result = await doctorApi.getNotifications(active?.params || {});
      setItems(Array.isArray(result?.items) ? result.items : []);
      setUnreadCount(Number(result?.unreadCount) || 0);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION_CREATED, load);
  useSocketEvent("connect", load);

  const markRead = async (notification) => {
    setBusyId(notification._id);
    try {
      await doctorApi.markNotificationRead(notification._id);
      notifyNotificationsChanged();
      // Re-read rather than patch the item locally: the read timestamp and the
      // unread count are both server-owned.
      await load();
    } catch (actionError) {
      toast.error(getDoctorApiError(actionError));
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const result = await doctorApi.markAllNotificationsRead();
      notifyNotificationsChanged();
      toast.success(`${result?.updated ?? 0} notification(s) marked read`);
      await load();
    } catch (actionError) {
      toast.error(getDoctorApiError(actionError));
    } finally {
      setMarkingAll(false);
    }
  };

  const unread = unreadCount;

  return (
    <DoctorPageShell
      title="Notifications"
      description="Appointment reminders, laboratory reports and system messages for your account."
      actions={
        <>
          <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={markAll} disabled={markingAll || !unread} className={CHIP_PRIMARY}>
            <CheckCheck className="size-4" />
            {markingAll ? "Marking..." : unread ? "Mark all read" : "All read"}
          </button>
        </>
      }
    >
      <DoctorCard title="Inbox" description={loading ? "Loading..." : `${items.length} shown · ${unread} unread`}>
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={() => setFilter(option.value)}
              className={
                filter === option.value
                  ? "rounded-full bg-teal-deep px-3 py-1.5 text-xs font-bold text-white"
                  : "rounded-full border border-deept/15 bg-white px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl bg-deept/5" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-xl border border-coral/30 bg-coral-pale px-4 py-3 text-sm text-coral-dark">{error}</p>
        ) : !items.length ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-deept/20 px-4 py-14 text-center">
            <Bell className="size-10 text-deept/20" />
            <p className="font-heading text-lg font-bold text-teal-deep">
              {filter ? "Nothing in this view" : "No notifications yet"}
            </p>
            <p className="max-w-sm text-sm text-ink-soft">
              {filter
                ? "Try the All view to see read messages."
                : "You are notified here when an appointment is booked, a laboratory report is verified, or a patient record changes."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              // The model stores `readAt`; `isRead` is derived here so the JSX
              // reads naturally and there is one definition of "read".
              const isRead = Boolean(item.readAt);
              return (
              <li
                key={item._id}
                className={`rounded-2xl border px-4 py-3 transition ${isRead ? "border-deept/10 bg-white" : "border-teal-mid bg-teal-pale/60"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-ink">{item.title}</p>
                      {!isRead && (
                        <span className="rounded-full bg-coral px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                          New
                        </span>
                      )}
                      {item.type && <StatusBadge status={item.type} />}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{item.message}</p>
                    <p className="mt-1.5 text-xs text-ink-soft">{formatDateTime(item.createdAt)}</p>
                    {item.link && (
                      <Link to={item.link} className="mt-2 inline-block text-xs font-bold text-teal-mid underline underline-offset-4">
                        Open related record
                      </Link>
                    )}
                  </div>
                  {!isRead && (
                    <button
                      type="button"
                      onClick={() => markRead(item)}
                      disabled={busyId === item._id}
                      className={CHIP_BUTTON}
                    >
                      {busyId === item._id ? "..." : "Mark read"}
                    </button>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </DoctorCard>

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
