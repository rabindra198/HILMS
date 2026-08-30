import { Logo } from "./Logo";

const product = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Roles", href: "#roles" },
];

const support = [
  { label: "Help", href: "#contact" },
  { label: "Contact", href: "#contact" },
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
];

export function Footer() {
  return (
    <footer id="contact" className="border-t border-teal/10 bg-white/70">
      <div className="hilms-container grid gap-10 py-14 md:grid-cols-3">
        <div className="md:col-span-1">
          <Logo size="lg" showTagline />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-mutedink">
            Hospital Information &amp; Laboratory Management System designed to
            connect healthcare workflows in one place.
          </p>
        </div>

        <FooterCol title="Product" links={product} />
        <FooterCol title="Support" links={support} />
      </div>

      <div className="border-t border-teal/10">
        <div className="hilms-container flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
          <p className="text-sm text-mutedink">© 2026 HILMS. All rights reserved.</p>
          <p className="text-sm font-semibold text-mutedink">
            Hospital Information &amp; Laboratory Management System
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-deept">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm text-mutedink transition-colors hover:text-teal"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
