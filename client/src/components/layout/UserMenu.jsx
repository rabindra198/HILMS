import { useState } from "react";
import { ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };
  const basePath = `/${user?.role || "patient"}`;
  const initials = (user?.name || "Patient").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-[#e7f4ee] text-xs font-bold text-[#1f4a40] ring-2 ring-white">
          {initials}
        </div>
        <div className="hidden text-left md:block">
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Link to={`${basePath}/profile`} onClick={() => setIsOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted">
              <UserCircle className="size-4 text-muted-foreground" />
              Profile
            </Link>
            <Link to={`${basePath}/settings`} onClick={() => setIsOpen(false)} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted">
              <Settings className="size-4 text-muted-foreground" />
              Settings
            </Link>
            <div className="border-t border-border" />
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted"
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
