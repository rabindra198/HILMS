import { useState } from "react";
import { Bell, Search, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserMenu } from "@/components/layout/UserMenu";

export function Header({ onToggleMobileSidebar, title = "Dashboard" }) {
  const { user } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileSidebar}
          className="flex size-9 items-center justify-center rounded-lg hover:bg-muted md:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden md:flex items-center gap-2">
          {showSearch ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search patients, doctors, appointments..."
                className="h-9 w-64 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                autoFocus
                onBlur={() => setShowSearch(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex size-9 items-center justify-center rounded-lg hover:bg-muted"
            >
              <Search className="size-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <button className="relative flex size-9 items-center justify-center rounded-lg hover:bg-muted">
          <Bell className="size-4 text-muted-foreground" />
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            3
          </span>
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
