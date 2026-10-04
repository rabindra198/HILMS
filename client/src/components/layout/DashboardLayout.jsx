import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlobalFooter } from "@/components/layout/GlobalFooter";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { useAuth } from "@/context/AuthContext";

export function DashboardLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="hilms-role flex min-h-screen w-full bg-white" data-role={user?.role || "patient"}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div
        className={`dashboard-content flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        }`}
      >
        <AppTopBar
          onToggleMobileSidebar={() => setSidebarOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <main className="flex-1 p-4 pt-4 sm:p-6 sm:pt-6 md:p-8 md:pt-6">
          <div className="role-page-content">
            <Outlet />
          </div>
        </main>
        <GlobalFooter />
      </div>
    </div>
  );
}

