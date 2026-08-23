import { useState } from "react";
import { ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
      >
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserCircle className="size-4" />
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
            <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted">
              <UserCircle className="size-4 text-muted-foreground" />
              Profile
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted">
              <Settings className="size-4 text-muted-foreground" />
              Settings
            </button>
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
