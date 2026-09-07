import { useEffect, useState } from "react";
import { Bell, Check, Calendar, FlaskConical, ClipboardCheck, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { doctorApi } from "@/services/doctorApi";
import { fallbackNotifications } from "@/services/doctorFallback";

const typeMeta = {
  appointment: { icon: Calendar, colors: "bg-coral/15 text-coral-dark" },
  lab: { icon: FlaskConical, colors: "bg-lavender/30 text-lavender" },
  followup: { icon: ClipboardCheck, colors: "bg-teal-mid/15 text-teal-mid" },
  summary: { icon: Info, colors: "bg-cream text-ink-soft" },
};

export default function DoctorNotifications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    doctorApi
      .getNotifications()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData(fallbackNotifications);
        setLoading(false);
      });
  }, []);

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount ?? notifications.filter((n) => !n.read).length;

  const formatTime = (time) => {
    if (!time) return "";
    const d = new Date(time);
    if (Number.isNaN(d.getTime())) return time;
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const handleMarkAllRead = () => {
    setData((prev) => ({
      ...prev,
      notifications: (prev?.notifications || []).map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    toast.success("All notifications marked as read");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Notifications
          </h1>
          <p className="text-base text-ink-soft font-medium">
            {loading
              ? "Loading notifications..."
              : `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`}
          </p>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="inline-flex items-center gap-2 rounded-full border-2 border-deept/15 bg-white px-5 py-2.5 text-sm font-semibold text-teal-deep hover:bg-teal-pale hover:border-teal-pale transition-all"
        >
          <Check className="size-4" />
          Mark All as Read
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-deept/10 bg-white shadow-sm">
          <Loader2 className="size-6 animate-spin text-ink-soft" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-deept/10 bg-white p-12 shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-full bg-cream">
            <Bell className="size-7 text-ink-soft" />
          </div>
          <p className="mt-4 text-sm font-medium text-ink">No notifications yet</p>
          <p className="mt-1 text-xs text-ink-soft">
            New appointments, lab reports, and follow-ups will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
          <div className="divide-y divide-deept/5">
            {notifications.map((notification) => {
              const meta = typeMeta[notification.type] || typeMeta.summary;
              const Icon = meta.icon;
              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 px-6 py-4 transition-colors hover:bg-teal-pale/30 ${
                    !notification.read ? "bg-teal-pale/20" : ""
                  }`}
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${meta.colors}`}>
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.read ? "font-semibold text-ink" : "text-ink"}`}>
                      {notification.title}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-soft">{notification.description}</p>
                    <p className="mt-1 text-xs text-ink-soft">{formatTime(notification.time)}</p>
                  </div>
                  {!notification.read && (
                    <span className="flex size-2.5 shrink-0 rounded-full bg-coral mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}