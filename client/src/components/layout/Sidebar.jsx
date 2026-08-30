import { useState } from "react";
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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navConfig = {
  admin: {
    main: [
      { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
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

function SidebarItem({ item, isActive, isCollapsed, onClick }) {
  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-coral text-white shadow-md shadow-coral/30"
          : "text-ink-soft hover:bg-teal-pale hover:text-teal-deep"
      }`}
    >
      <item.icon className={`size-4 shrink-0 ${isActive ? "text-white" : ""}`} />
      {!isCollapsed && <span>{item.title}</span>}
    </Link>
  );
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role || "patient";
  const nav = navConfig[role] || navConfig.patient;

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
        />
      ))}
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-deept/10 px-4 py-4">
        {!isCollapsed ? (
          <Link to={`/${role}/dashboard`} className="flex items-center gap-2.5 no-underline">
            <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-coral to-lavender shadow-lg shadow-coral/30">
              <HeartPulse className="size-5 text-white" strokeWidth={2.4} />
              <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-white ring-2 ring-cream">
                <span className="size-1.5 rounded-full bg-coral-dark" />
              </span>
            </span>
            <div>
              <p className="font-heading text-base font-bold text-teal-deep tracking-tight">HILMS</p>
              <p className="text-[10px] font-medium text-ink-soft leading-tight">Hospital Management</p>
            </div>
          </Link>
        ) : (
          <Link to={`/${role}/dashboard`} className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-coral to-lavender shadow-lg shadow-coral/30 mx-auto no-underline">
            <HeartPulse className="size-5 text-white" strokeWidth={2.4} />
          </Link>
        )}
        <button
          onClick={onToggleCollapse}
          className="hidden size-8 items-center justify-center rounded-lg hover:bg-teal-pale md:flex transition-colors"
        >
          {isCollapsed ? <ChevronRight className="size-4 text-teal-deep" /> : <ChevronLeft className="size-4 text-teal-deep" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-3">
          {role === "admin" && renderNavGroup("Main", nav.main)}
          {role === "doctor" && (
            <>
              {renderNavGroup("Clinical", nav.clinical)}
              {renderNavGroup("Schedule", nav.schedule)}
            </>
          )}
          {(role === "lab" || role === "patient") && renderNavGroup("Main", nav.main)}
          {renderNavGroup("Account", nav.account)}
        </div>
      </div>

      {/* Logout */}
      <div className="border-t border-deept/10 p-2">
        <Link
          to="/login"
          onClick={async (e) => {
            e.preventDefault();
            await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            window.location.href = "/login";
          }}
          className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-teal-pale hover:text-teal-deep transition-colors"
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
