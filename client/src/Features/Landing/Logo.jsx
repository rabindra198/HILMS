import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single HILMS wordmark.
 *
 * `tone` exists because the brand appears on light surfaces (landing page, app
 * header) and on the dark global footer. Rather than adding a second, lookalike
 * logo for dark backgrounds, the existing component takes an `inverse` tone.
 *
 * `href` is configurable for the same reason: on the marketing page the wordmark
 * is an in-page anchor, while inside the application it must return to the landing
 * page root.
 */
export function Logo({ size = "md", showTagline = false, tone = "light", href = "#home" }) {
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const icon = size === "lg" ? "size-7" : "size-6";
  const isInverse = tone === "inverse";

  return (
    <a href={href} className="flex items-center gap-3 no-underline" aria-label="HILMS home">
      <span
        className={cn(
          "relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-deep to-lavender shadow-lg shadow-teal-mid/30",
          box
        )}
      >
        <HeartPulse className={cn("text-white", icon)} strokeWidth={2.4} />
        <span
          className={cn(
            "absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-white ring-2",
            isInverse ? "ring-white/25" : "ring-softteal"
          )}
        >
          <span className="size-1.5 rounded-full bg-teal-mid" />
        </span>
      </span>
      <span className="flex flex-col">
        <span
          className={cn(
            "font-heading font-extrabold tracking-tight",
            isInverse ? "text-white" : "text-deept",
            size === "lg" ? "text-2xl" : "text-xl"
          )}
        >
          HILMS
        </span>
        {showTagline && (
          <span
            className={cn(
              "hidden text-[11px] font-medium leading-tight sm:block",
              isInverse ? "text-white/70" : "text-mutedink"
            )}
          >
            Hospital Information &amp; Laboratory
            <span className="block">Management System</span>
          </span>
        )}
      </span>
    </a>
  );
}
