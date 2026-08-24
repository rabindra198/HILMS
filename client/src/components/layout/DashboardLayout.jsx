import { useState } from "react";
import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div
        className={`dashboard-content flex min-w-0 flex-1 flex-col transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        }`}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="mobile-menu-button fixed left-4 top-4 z-40 flex size-10 items-center justify-center rounded-xl border border-border bg-card shadow-md md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </button>
        <main className="flex-1 overflow-y-auto p-3 pt-16 sm:p-4 sm:pt-16 md:p-6 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
