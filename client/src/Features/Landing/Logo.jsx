import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ size = "md", showTagline = false }) {
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const icon = size === "lg" ? "size-7" : "size-6";

  return (
    <a href="#home" className="flex items-center gap-3 no-underline" aria-label="HILMS home">
      <span
        className={cn(
          "relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-coral to-lavender shadow-lg shadow-coral/30",
          box
        )}
      >
        <HeartPulse className={cn("text-white", icon)} strokeWidth={2.4} />
        <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-white ring-2 ring-cream">
          <span className="size-1.5 rounded-full bg-coral-dark" />
        </span>
      </span>
      <span className="flex flex-col">
        <span
          className={cn(
            "font-heading font-extrabold tracking-tight text-deept",
            size === "lg" ? "text-2xl" : "text-xl"
          )}
        >
          HILMS
        </span>
        {showTagline && (
          <span className="hidden text-[11px] font-medium leading-tight text-mutedink sm:block">
            Hospital Information &amp; Laboratory
            <span className="block">Management System</span>
          </span>
        )}
      </span>
    </a>
  );
}
