import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FlaskConical,
  CreditCard,
  BarChart3,
  Stethoscope,
  FileText,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCircle,
  HeartPulse,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLES, ROLE_AREA } from "@/lib/roles";
import api, { unwrap } from "@/lib/axios";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

const navConfig = {
  admin: {
    main: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { title: "Access Requests", href: "/admin/access-requests", icon: UserPlus },
      { title: "Patients", href: "/admin/patients", icon: Users },
      { title: "Appointments", href: "/admin/appointments", icon: Calendar },
      { title: "Doctor Availability", href: "/admin/doctors", icon: Stethoscope },
      { title: "Billing", href: "/admin/billing", icon: CreditCard },
      { title: "Laboratory", href: "/admin/laboratory", icon: FlaskConical },
      { title: "Reports", href: "/admin/reports", icon: BarChart3 },
    ],
    account: [
      { title: "Profile", href: "/admin/profile", icon: UserCircle },
      { title: "Notifications", href: "/admin/notifications", icon: Bell },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  doctor: {
    clinical: [
      { title: "Dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
      { title: "Appointments", href: "/doctor/appointments", icon: Calendar },
      { title: "Patients", href: "/doctor/patients", icon: Users },
      { title: "Consultations", href: "/doctor/consultations", icon: FileText },
      { title: "Prescriptions", href: "/doctor/prescriptions", icon: FileText },
      { title: "Lab Reports", href: "/doctor/laboratory-reports", icon: FlaskConical },
      { title: "Follow-ups", href: "/doctor/follow-ups", icon: Calendar },
    ],
    schedule: [
      { title: "My Schedule", href: "/doctor/schedule", icon: Calendar },
      { title: "Working Hours", href: "/doctor/working-hours", icon: Settings },
    ],
    account: [
      { title: "Profile", href: "/doctor/profile", icon: UserCircle },
      { title: "Notifications", href: "/doctor/notifications", icon: Bell },
      { title: "Settings", href: "/doctor/settings", icon: Settings },
    ],
  },
  lab: {
    main: [
      { title: "Dashboard", href: "/lab/dashboard", icon: LayoutDashboard },
      { title: "Lab Requests", href: "/lab/requests", icon: FileText },
      { title: "Sample Collection", href: "/lab/samples", icon: FlaskConical },
      { title: "Processing", href: "/lab/processing", icon: FlaskConical },
      { title: "Reports", href: "/lab/reports", icon: BarChart3 },
      { title: "Tests & Reference Ranges", href: "/lab/tests", icon: FlaskConical },
    ],
    account: [
      { title: "Profile", href: "/lab/profile", icon: UserCircle },
      { title: "Notifications", href: "/lab/notifications", icon: Bell },
      { title: "Settings", href: "/lab/settings", icon: Settings },
    ],
  },
  patient: {
    main: [
      { title: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
      { title: "Appointments", href: "/patient/appointments", icon: Calendar },
      { title: "Medical History", href: "/patient/medical-history", icon: FileText },
      { title: "Prescriptions", href: "/patient/prescriptions", icon: FileText },
      { title: "Lab Reports", href: "/patient/laboratory-reports", icon: FlaskConical },
      { title: "Payments", href: "/patient/payments", icon: CreditCard },
    ],
    account: [
      { title: "Profile", href: "/patient/profile", icon: UserCircle },
      { title: "Notifications", href: "/patient/notifications", icon: Bell },
      { title: "Settings", href: "/patient/settings", icon: Settings },
    ],
  },
};

const NOTIFICATION_REFRESH_INTERVAL = 30_000;

function SidebarItem({ item, isActive, isCollapsed, onClick, unreadCount }) {
  const isNotifications = item.href.endsWith("/notifications");
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Link
      to={item.href}
      onClick={onClick}
      aria-label={isNotifications && unreadCount > 0 ? `Notifications, ${unreadCount} unread` : undefined}
      title={isCollapsed ? item.title : undefined}
      className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-[#dcefe7] text-[#168d79] shadow-none"
          : "text-ink-soft hover:bg-softteal hover:text-teal-deep"
      } ${isCollapsed ? "relative" : ""}`}
    >
      <item.icon className="size-4 shrink-0" />
      {!isCollapsed && <span>{item.title}</span>}
      {isNotifications && unreadCount > 0 && (
        <span
          aria-hidden="true"
          className={`inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-sm ${
            isCollapsed ? "absolute -right-1 -top-1 ring-2 ring-white" : "ml-auto"
          }`}
        >
          {badgeLabel}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const role = user?.role || ROLES.PATIENT;
  const nav = navConfig[role] || navConfig.patient;
  const homeHref = `${ROLE_AREA[role] || ROLE_AREA[ROLES.PATIENT]}/dashboard`;
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async (signal) => {
    try {
      const response = await api.get(`${ROLE_AREA[role]}/notifications/unread-count`, { signal });
      const result = unwrap(response);
      const count = typeof result === "number" ? result : Number(result?.unreadCount ?? result?.count ?? 0);
      if (!signal?.aborted) setUnreadCount(Number.isFinite(count) && count > 0 ? count : 0);
    } catch (error) {
      if (!signal?.aborted) console.error("Could not refresh the sidebar notification count:", error);
    }
  }, [role]);

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION_CREATED, () => refreshUnreadCount());
  useSocketEvent("connect", () => refreshUnreadCount());

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState === "visible") refreshUnreadCount(controller.signal);
    };
    refresh();
    const interval = window.setInterval(refresh, NOTIFICATION_REFRESH_INTERVAL);
    window.addEventListener("focus", refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [location.pathname, refreshUnreadCount]);

  const isActive = (href) => location.pathname === href || location.pathname.startsWith(href + "/");

  const renderNavGroup = (title, items) => (
    <div className="space-y-1">
      {title && !isCollapsed && (
        <p className="px-4 pt-3 pb-1 text-xs font-bold text-ink-soft uppercase tracking-wider">
          {title}
        </p>
      )}
      {items.map((item) => (
        <SidebarItem
          key={item.href}
          item={item}
          isActive={isActive(item.href)}
          isCollapsed={isCollapsed}
          onClick={onClose}
          unreadCount={unreadCount}
        />
      ))}
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-[#e6edf0] px-4 py-4">
        {!isCollapsed ? (
          <Link to={homeHref} className="flex items-center gap-2.5 no-underline">
            <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-deep to-lavender shadow-lg shadow-teal-mid/30">
              <HeartPulse className="size-5 text-white" strokeWidth={2.4} />
              <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-white ring-2 ring-[#e6edf0]">
                <span className="size-1.5 rounded-full bg-coral-dark" />
              </span>
            </span>
            <div>
              <p className="font-heading text-base font-bold text-[#123b52] tracking-tight">HILMS</p>
              <p className="text-[10px] font-medium text-ink-soft leading-tight">Hospital Management</p>
            </div>
          </Link>
        ) : (
          <Link to={homeHref} className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-deep to-lavender shadow-lg shadow-teal-mid/30 mx-auto no-underline">
            <HeartPulse className="size-5 text-white" strokeWidth={2.4} />
          </Link>
        )}
        <button
          onClick={onToggleCollapse}
          className="hidden size-8 items-center justify-center rounded-lg hover:bg-softteal md:flex transition-colors"
        >
          {isCollapsed ? <ChevronRight className="size-4 text-teal-deep" /> : <ChevronLeft className="size-4 text-teal-deep" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-3">
          {role === ROLES.ADMIN && renderNavGroup("Main", nav.main)}
          {role === ROLES.DOCTOR && (
            <>
              {renderNavGroup("Clinical", nav.clinical)}
              {renderNavGroup("Schedule", nav.schedule)}
            </>
          )}
          {(role === ROLES.LAB || role === ROLES.PATIENT) && renderNavGroup("Main", nav.main)}
          {renderNavGroup("Account", nav.account)}
        </div>
      </div>

      {/* Logout */}
      <div className="border-t border-[#e6edf0] p-2">
        <Link
          to="/login"
          onClick={async (e) => {
            e.preventDefault();
            // Clears the httpOnly cookie server-side, then hard-reloads so no
            // cached role-scoped state survives the logout.
            await logout();
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-softteal hover:text-teal-deep transition-colors"
        >
          <LogOut className="size-4 shrink-0" />
          {!isCollapsed && <span>Logout</span>}
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-50 hidden border-r border-deept/10 bg-white transition-all duration-300 md:block ${
          isCollapsed ? "w-[72px]" : "w-[260px]"
        }`}
      >
        {sidebarContent}
      </div>
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 w-[260px] border-r border-deept/10 bg-white">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
