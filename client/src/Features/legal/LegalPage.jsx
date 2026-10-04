import { Link } from "react-router-dom";
import { ArrowLeft, CircleAlert, FileText } from "lucide-react";
import { Logo } from "@/Features/Landing/Logo";
import { GlobalFooter } from "@/components/layout/GlobalFooter";
import { useAuth } from "@/context/AuthContext";
import { getRoleHome } from "@/lib/roles";

/**
 * One reusable page component for the footer's legal / system documents.
 *
 * IMPORTANT: HILMS does not ship invented legal text. The Privacy Policy and
 * Terms of Service entries below are OUTLINES - a list of the topics a document
 * must cover - rendered behind a prominent notice that the document has not been
 * drafted or reviewed. A project owner or legal adviser replaces the `sections`
 * array with real, approved wording before relying on it.
 *
 * The `/third-party-notices` entry is different in kind: it is a factual
 * inventory of declared dependencies taken from the project's own
 * `package.json` files, and it makes no legal claims of its own.
 */

const PENDING_OUTLINE = [
  "Scope and applicability - which roles, data categories and processing activities this document covers.",
  "Data collected - identity, contact, account, appointment, clinical, laboratory and billing data held in the system.",
  "Purpose and lawful basis - why each category is processed and which basis applies in your jurisdiction.",
  "Access and authorisation - role-scoped access, care-team assignment and audit logging of record access.",
  "Retention - how long records are kept, and the criteria for archival or deletion.",
  "Sharing - disclosures to other care providers, laboratories, payment processors and authorities, and the conditions for each.",
  "Security controls - authentication, session handling, transport encryption and audit trails.",
  "Individual rights - access, correction, export, restriction and objection, plus how to exercise them.",
  "Contact and complaints - the channel and the expected response time.",
];

const THIRD_PARTY_GROUPS = [
  {
    heading: "Client runtime packages",
    manifest: "client/package.json",
    packages: [
      "react",
      "react-dom",
      "react-router-dom",
      "axios",
      "lucide-react",
      "zod",
      "react-hook-form",
      "@hookform/resolvers",
      "sonner",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "@base-ui/react",
      "react-multi-select-component",
      "@fontsource-variable/geist",
    ],
  },
  {
    heading: "Client build tooling",
    manifest: "client/package.json",
    packages: ["vite", "@vitejs/plugin-react", "tailwindcss", "@tailwindcss/vite", "shadcn", "tw-animate-css"],
  },
  {
    heading: "Server runtime packages",
    manifest: "server/package.json",
    packages: [
      "express",
      "mongoose",
      "bcryptjs",
      "cookie-parser",
      "cors",
      "dotenv",
      "express-validator",
      "jsonwebtoken",
      "multer",
      "nodemailer",
      "pdfkit",
    ],
  },
];

const DOCUMENTS = {
  "privacy-policy": {
    title: "Privacy Policy",
    intro:
      "This page is a structured outline for the HILMS privacy policy. It is not yet a published policy and must not be relied upon as one.",
    status: "needs-drafting",
    sections: PENDING_OUTLINE,
  },
  "terms-of-service": {
    title: "Terms of Service",
    intro:
      "This page is a structured outline for the HILMS terms of service. It is not yet a published agreement and must not be relied upon as one.",
    status: "needs-drafting",
    sections: [
      "Acceptance - who may use the system and what using it constitutes.",
      "Accounts and credentials - registration, approval, password obligations and account termination.",
      "Permitted use - clinical and administrative use, acceptable data entry, and prohibited activity.",
      "Professional responsibility - the duty of clinicians to verify information and exercise independent judgement.",
      "Laboratory results - the status of results before and after verification, and reliance limits.",
      "Payments - billing responsibilities, fees, refunds and disputes.",
      "Availability and support - support windows, maintenance and service levels.",
      "Intellectual property - rights in the application itself, excluding third-party components.",
      "Disclaimers and limitation of liability - to be drafted for your jurisdiction.",
      "Changes, governing law and termination - amendment process and dispute resolution.",
    ],
  },
  "third-party-notices": {
    title: "Third-Party Notices",
    intro:
      "HILMS relies on third-party packages. Each one is distributed by its own author under its own licence, and this application claims no ownership of them.",
    status: "maintained",
    groups: THIRD_PARTY_GROUPS,
    note:
      "Licence terms and copyright holders are defined by each package itself. For the authoritative text of any dependency, read its LICENSE file in node_modules/<package>/, or the repository declared in its package.json. The lists above mirror the dependency sections of the project's own manifests and should be refreshed whenever those change.",
  },
};

export function LegalPage({ document: docKey }) {
  const { user } = useAuth();
  const doc = DOCUMENTS[docKey];
  const backHref = user?.role ? getRoleHome(user.role) : "/login";
  const backLabel = user?.role ? "Back to my dashboard" : "Back to sign in";

  if (!doc) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="font-heading text-3xl font-bold text-deept">Document not found</h1>
          <p className="mt-2 text-mutedink">The page you requested does not exist.</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-teal hover:text-teal-deep">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to HILMS
          </Link>
        </main>
        <GlobalFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-deept/10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Logo href="/" />
          <Link
            to={backHref}
            className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-deept/15 px-3 py-2 text-sm font-semibold text-deept transition-colors hover:bg-teal-pale focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {backLabel}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-teal">
          <FileText className="size-4" aria-hidden="true" />
          HILMS
        </p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-deept sm:text-4xl">{doc.title}</h1>
        <p className="mt-3 text-base leading-relaxed text-mutedink">{doc.intro}</p>

        {doc.status === "needs-drafting" && (
          <div
            role="note"
            className="mt-6 flex gap-3 rounded-2xl border border-coral/40 bg-coral-pale/50 p-4 text-sm leading-relaxed text-[#7a3a26]"
          >
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-bold">Placeholder &mdash; awaiting project-owner and legal review.</span>{" "}
              Nothing on this page is legal advice and nothing here describes a policy the
              project has adopted. The list below is a prompt for whoever drafts the
              document, not published policy text.
            </p>
          </div>
        )}

        {doc.sections && (
          <section className="mt-8" aria-labelledby={`${docKey}-topics`}>
            <h2 id={`${docKey}-topics`} className="font-heading text-xl font-bold text-deept">
              Topics this document must cover
            </h2>
            <ol className="mt-4 space-y-3">
              {doc.sections.map((section) => (
                <li key={section} className="flex gap-3 text-sm leading-relaxed text-mutedink">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-coral"
                    aria-hidden="true"
                  />
                  <span>{section}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {doc.groups && (
          <section className="mt-8 space-y-6" aria-label="Declared dependencies">
            {doc.groups.map((group) => (
              <div key={group.heading}>
                <h2 className="font-heading text-lg font-bold text-deept">{group.heading}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-mutedink">
                  Declared in <code className="font-mono">{group.manifest}</code>
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {group.packages.map((name) => (
                    <li
                      key={name}
                      className="rounded-lg bg-teal-pale px-2.5 py-1 font-mono text-xs text-teal-deep"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-sm leading-relaxed text-mutedink">{doc.note}</p>
          </section>
        )}
      </main>

      <GlobalFooter />
    </div>
  );
}

export default LegalPage;
