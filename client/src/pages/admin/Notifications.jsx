import { Bell, Check, User, Calendar, AlertCircle } from "lucide-react";

const mockNotifications = [
  { id: 1, type: "appointment", message: "New appointment booked by Raj Sharma for tomorrow at 10:30 AM", time: "5 min ago", read: false, icon: Calendar },
  { id: 2, type: "lab", message: "Lab report ready for John Doe - CBC Test", time: "1 hour ago", read: false, icon: AlertCircle },
  { id: 3, type: "user", message: "New patient registered: Maya Rai", time: "2 hours ago", read: true, icon: User },
  { id: 4, type: "system", message: "System maintenance scheduled for tonight at 11 PM", time: "3 hours ago", read: true, icon: Bell },
  { id: 5, type: "appointment", message: "Dr. Sharma cancelled appointment for today at 12 PM", time: "5 hours ago", read: true, icon: Calendar },
];

export default function NotificationsPage() {
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Notifications
          </h1>
          <p className="text-base text-ink-soft font-medium">
            You have {unreadCount} unread notifications.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full border-2 border-deept/15 bg-white px-5 py-2.5 text-sm font-semibold text-teal-deep hover:bg-teal-pale hover:border-teal-pale transition-all">
          <Check className="size-4" />
          Mark All as Read
        </button>
      </div>

      <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-deept/5">
          {mockNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-4 px-6 py-4 transition-colors hover:bg-teal-pale/30 ${
                !notification.read ? "bg-teal-pale/20" : ""
              }`}
            >
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                !notification.read ? "bg-coral/15 text-coral-dark" : "bg-cream text-ink-soft"
              }`}>
                <notification.icon className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!notification.read ? "font-semibold text-ink" : "text-ink-soft"}`}>
                  {notification.message}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{notification.time}</p>
              </div>
              {!notification.read && (
                <span className="flex size-2.5 shrink-0 rounded-full bg-coral mt-2" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
