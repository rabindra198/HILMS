import { Link } from "react-router-dom";
import {
  Building2,
  Clock,
  FlaskConical,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { Logo } from "@/Features/Landing/Logo";
import { SITE, SUPPORT_CONTACT, SUPPORT_CONTACT_ROWS, hasSupportContact } from "@/config/site";
import { useAuth } from "@/context/AuthContext";
import { getRoleHome, normalizeRole } from "@/lib/roles";

/**
 * ONE global footer for the entire authenticated HILMS application.
 *
 * It is mounted a single time, inside `components/layout/DashboardLayout.jsx`,
 * which is the shared shell that Admin, Doctor, Laboratory and Patient already
 * use. There is deliberately no per-role copy: all four areas render this exact
 * component and therefore always agree on branding, copyright and global links.
 *
 * Design constraints honoured here:
 * - Global, not a second navigation system. It links only site-wide destinations;
 *   role-specific screens (appointments, consultations, samples, settings...)
 *   stay in the Sidebar.
 * - No invented contact details. Support rows render only what `config/site.js`
 *   reads from this deployment's `VITE_HILMS_*` environment variables.
 * - No cross-role route leakage. The MODULES column is informational text; the
 *   protected `/admin`, `/doctor`, `/lab` and `/patient` areas are never linked
 *   from a footer that every role can see.
 * - No third-party ownership claims. Third-party attribution is delegated to the
 *   dedicated `/third-party-notices` page instead of cluttering this footer.
 */

/** Site-wide destinations. Safe for every role and for signed-out visitors. */
const QUICK_LINKS = [
  { label: "Home", to: "/" },
  { label: "About HILMS", to: "/#about" },
  { label: "How It Works", to: "/#how-it-works" },
  { label: "Modules", to: "/#roles" },
];

/**
 * Modules HILMS covers. Rendered as text, not links - a Patient must not be
 * offered a route into `/admin`, and vice versa. The signed-in member's own
 * module is highlighted instead.
 */
const MODULES = [
  { label: "Patient", icon: HeartPulse },
  { label: "Doctor", icon: Stethoscope },
  { label: "Laboratory", icon: FlaskConical },
  { label: "Administration", icon: Building2 },
];

const ROLE_MODULE_LABEL = Object.freeze({
  admin: "Administration",
  doctor: "Doctor",
  lab: "Laboratory",
  patient: "Patient",
});

/** Legal / system documents. These exist as clearly-marked placeholder routes. */
const SYSTEM_LINKS = [
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms of Service", to: "/terms-of-service" },
];

const CONTACT_ICONS = { email: Mail, phone: Phone, location: MapPin, hours: Clock };

const SECONDARY = "text-[#d5e4df]";

const linkClasses = `inline-flex min-h-[2rem] items-center rounded-sm text-sm transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e9785a] ${SECONDARY}`;

export function GlobalFooter() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const dashboardHref = user?.role ? getRoleHome(user.role) : "";
  const activeModule = ROLE_MODULE_LABEL[role] ?? "";

  return (
    <footer className="shrink-0 bg-deept text-white">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 sm:py-9 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6">
          {/* ---- Brand -------------------------------------------------- */}
          <div className="lg:col-span-4">
            <Logo size="lg" showTagline tone="inverse" href="/" />
            <p className={`mt-4 max-w-sm text-sm leading-relaxed ${SECONDARY}`}>{SITE.tagline}</p>
          </div>

          {/* ---- Quick links -------------------------------------------- */}
          <nav aria-label="Footer quick links" className="lg:col-span-2">
            <FooterHeading>Quick links</FooterHeading>
            <ul className="mt-2">
              {dashboardHref && (
                <li>
                  <Link to={dashboardHref} className={`${linkClasses} font-semibold`}>
                    Dashboard
                  </Link>
                </li>
              )}
              {QUICK_LINKS.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className={linkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ---- Modules (informational, never links) -------------------- */}
          <div className="lg:col-span-2">
            <FooterHeading>Modules</FooterHeading>
            <ul className="mt-2">
              {MODULES.map(({ label, icon: Icon }) => {
                const isActive = label === activeModule;
                return (
                  <li key={label}>
                    <span
                      className={`inline-flex min-h-[2rem] items-center gap-2 text-sm ${
                        isActive ? "font-semibold text-white" : SECONDARY
                      }`}
                    >
                      <Icon
                        className={`size-4 shrink-0 ${isActive ? "text-[#e9785a]" : "text-white/45"}`}
                        aria-hidden="true"
                      />
                      {label}
                      {isActive && <span className="sr-only">(your portal)</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ---- System -------------------------------------------------- */}
          <nav aria-label="Legal and system" className="lg:col-span-2">
            <FooterHeading>System</FooterHeading>
            <ul className="mt-2">
              {SYSTEM_LINKS.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className={linkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ---- Contact ------------------------------------------------- */}
          <div className="lg:col-span-2">
            <FooterHeading>Contact</FooterHeading>
            {SUPPORT_CONTACT.organisation && (
              <p className="mt-2 text-sm font-semibold text-white">{SUPPORT_CONTACT.organisation}</p>
            )}
            {hasSupportContact ? (
              <ul className="mt-1 space-y-1">
                {SUPPORT_CONTACT_ROWS.map(({ key, label, value, href }) => {
                  const Icon = CONTACT_ICONS[key];
                  return (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      <Icon className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden="true" />
                      <span className={SECONDARY}>
                        <span className="sr-only">{label}: </span>
                        {href ? (
                          <a
                            href={href}
                            className="rounded-sm transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e9785a]"
                          >
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`mt-2 text-sm leading-relaxed ${SECONDARY}`}>
                Support contacts are configured per deployment by your hospital
                administrator.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---- Copyright ------------------------------------------------- */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm text-white">
              &copy; {SITE.copyrightYear} {SITE.name} &mdash; {SITE.fullName}. All rights reserved.
            </p>
            <p className={`mt-1 text-xs leading-relaxed ${SECONDARY}`}>
              {SITE.name} is the project&rsquo;s own application software. Third-party
              components are used under their respective licences.
            </p>
          </div>
          <Link
            to="/third-party-notices"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-sm text-sm text-[#e9785a] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e9785a] lg:self-auto"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Third-party notices
          </Link>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white">{children}</h2>
  );
}
