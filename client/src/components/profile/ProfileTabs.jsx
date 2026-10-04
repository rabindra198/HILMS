import { LockKeyhole, UserRound } from "lucide-react";

const TAB_CLASS =
  "group inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-mid/30";
const TAB_ACTIVE = "bg-teal-deep text-white shadow-sm";
const TAB_INACTIVE =
  "bg-white text-teal-deep border border-deept/15 hover:bg-teal-pale";

export const TABS = {
  PUBLIC: "public",
  SECURITY: "security",
};

export default function ProfileTabs({ active, onChange }) {
  return (
    <nav className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-deept/10 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={() => onChange(TABS.PUBLIC)}
        className={`${TAB_CLASS} ${
          active === TABS.PUBLIC ? TAB_ACTIVE : TAB_INACTIVE
        }`}
      >
        <UserRound className="size-4" />
        <span>Public Profile</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(TABS.SECURITY)}
        className={`${TAB_CLASS} ${
          active === TABS.SECURITY ? TAB_ACTIVE : TAB_INACTIVE
        }`}
      >
        <LockKeyhole className="size-4" />
        <span>Security</span>
      </button>
    </nav>
  );
}
