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
    <header className="flex h-16 items-center justify-between border-b border-deept/10 bg-white px-4 md:px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileSidebar}
          className="flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale md:hidden transition-colors"
        >
          <Menu className="size-5 text-teal-deep" />
        </button>
        <div>
          <h1 className="font-heading text-lg font-bold text-teal-deep">{title}</h1>
          <p className="text-sm text-ink-soft">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden md:flex items-center gap-2">
          {showSearch ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search patients, doctors, appointments..."
                className="h-9 w-64 rounded-xl border border-deept/15 bg-white px-3 text-sm text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20 transition-all"
                autoFocus
                onBlur={() => setShowSearch(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors"
            >
              <Search className="size-4 text-teal-deep" />
            </button>
          )}
        </div>

        <button className="relative flex size-9 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors">
          <Bell className="size-4 text-teal-deep" />
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-coral text-[10px] font-bold text-white">
            3
          </span>
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
