import { Bell, Menu, Moon, Sun, UserCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const initialsOf = (name) => {
  if (!name) return "H";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "H"
  );
};

export function AppTopBar({
  onToggleMobileSidebar,
  onToggleSidebar,
  sidebarCollapsed,
}) {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    setDark((d) => !d);
    document.documentElement.classList.toggle("dark");
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const role = user?.role;
  const basePath = role ? `/${role}` : "/";
  const displayName = user?.name || "User";
  const photoUrl = user?.profilePhotoUrl;
  const roleLabel =
    role === "lab"
      ? "Laboratory"
      : role?.charAt(0).toUpperCase() + role?.slice(1);

  return (
    <header className="relative z-30 flex h-14 items-center justify-between border-b border-deept/10 bg-white px-3 md:h-16 md:px-6">
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="hidden size-8 items-center justify-center rounded-lg hover:bg-teal-pale md:flex transition-colors"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <Menu className="size-4 text-teal-deep" />
          </button>
        )}
        {onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-teal-pale md:hidden transition-colors"
          >
            <Menu className="size-4 text-teal-deep" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-3">
        <button
          onClick={toggleTheme}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors"
          aria-label="Toggle theme"
        >
          {dark ? (
            <Sun className="size-4 text-teal-deep" />
          ) : (
            <Moon className="size-4 text-teal-deep" />
          )}
        </button>
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-teal-pale transition-colors md:gap-2 md:px-2"
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="size-8 rounded-full object-cover ring-2 ring-white md:size-9"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-teal-pale text-xs font-semibold text-teal-deep ring-2 ring-white md:size-9">
                {initialsOf(displayName)}
              </div>
            )}
            <div className="hidden text-left md:block min-w-0">
              <p className="truncate text-sm font-medium text-ink max-w-[120px] lg:max-w-[160px]">
                {displayName}
              </p>
              <p className="truncate text-xs text-ink-soft capitalize max-w-[120px] lg:max-w-[160px]">
                {roleLabel}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-4 text-ink-soft"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-deept/10 bg-white py-1 shadow-lg">
                <div className="border-b border-deept/10 px-3 py-2">
                  <p className="truncate text-sm font-medium text-ink">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    {user?.email}
                  </p>
                  <p className="text-xs text-ink-soft capitalize">
                    {roleLabel}
                  </p>
                </div>
                <Link
                  to={`${basePath}/profile`}
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-teal-pale"
                >
                  <UserCircle className="size-4 text-ink-soft" />
                  Profile
                </Link>
                <Link
                  to={`${basePath}/settings`}
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-teal-pale"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="size-4 text-ink-soft"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                  Settings
                </Link>
                <Link
                  to={`${basePath}/notifications`}
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-teal-pale"
                >
                  <Bell className="size-4 text-ink-soft" />
                  Notifications
                </Link>
                <div className="border-t border-deept/10" />
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-coral-dark hover:bg-coral-pale"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="size-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                    />
                  </svg>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
