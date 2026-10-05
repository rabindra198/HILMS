import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { patientApi, getApiError } from "@/services/patientApi";
import { notifyNotificationsChanged } from "@/lib/notifications";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";
import {
  PatientCard,
  PatientPageShell,
  PatientTrustNote,
  CHIP_BUTTON,
  CHIP_PRIMARY,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  formatDateTime,
  humanise,
  relativeTime,
} from "./patientUi";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
];

/**
 * Notifications.
 *
 * Reads the shared Notification collection: the same records the doctor and
 * laboratory modules write when they verify a report, issue a prescription or
 * confirm an appointment. Read state is stored server-side, so marking something
 * read here is not a per-browser flag.
 */
export default function PatientNotifications() {
  const [data, setData] = useState({ items: [], unreadCount: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      try {
        const params = filter === "all" ? {} : { [filter]: "true" };
        setData(await patientApi.getNotifications(params));
        setError("");
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION_CREATED, () => load({ quiet: true }));
  useSocketEvent("connect", () => load({ quiet: true }));

  const markRead = async (id) => {
    try {
      await patientApi.markNotificationRead(id);
      notifyNotificationsChanged();
      await load({ quiet: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const markAllRead = async () => {
    try {
      await patientApi.markAllNotificationsRead();
      notifyNotificationsChanged();
      await load({ quiet: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  };

  const items = data.items || [];

  return (
    <PatientPageShell
      title="Notifications"
      description="Appointment confirmations, prescriptions and verified laboratory results."
      actions={
        <>
          <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {data.unreadCount > 0 && (
            <button type="button" onClick={markAllRead} className={PRIMARY_BUTTON}>
              <CheckCheck className="size-4" />
              Mark all read
            </button>
          )}
        </>
      }
    >
      <PatientCard
        title="Updates"
        description={data.unreadCount > 0 ? `${data.unreadCount} unread` : "You are all caught up."}
        action={
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                className={filter === option.key ? CHIP_PRIMARY : CHIP_BUTTON}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {error && <p className="mb-3 text-sm font-semibold text-coral-dark">{error}</p>}

        {loading ? (
          <p className="py-6 text-center text-sm text-ink-soft">Loading notifications...</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">
            Nothing here yet. You are notified when the clinic confirms an appointment or a laboratory verifies a
            report.
          </p>
        ) : (
          <ul className="divide-y divide-deept/5">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between ${
                  item.read ? "" : "rounded-xl bg-teal-pale/30 px-3"
                }`}
              >
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-mid/15 text-teal-mid">
                    <Bell className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-teal-deep">
                      {item.title}
                      {!item.read && (
                        <span className="ml-2 inline-block size-2 rounded-full bg-coral align-middle" aria-label="Unread" />
                      )}
                    </p>
                    {item.message && <p className="mt-0.5 text-sm text-ink-soft">{item.message}</p>}
                    <p className="mt-1 text-xs text-ink-soft">
                      {humanise(item.type)} &middot; {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>
                {!item.read && (
                  <button type="button" onClick={() => markRead(item.id)} className={SECONDARY_BUTTON.replace("px-4 py-2.5", "px-3 py-2")}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <PatientTrustNote />
          {items.length > 0 && (
            <p className="shrink-0 text-xs text-ink-soft">Newest first &middot; {formatDateTime(items[0].createdAt)}</p>
          )}
        </div>
      </PatientCard>
    </PatientPageShell>
  );
}