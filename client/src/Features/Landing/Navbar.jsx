import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const links = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Roles", href: "#roles" },
  { label: "Contact", href: "#contact" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-cream/90 shadow-[0_8px_30px_-12px_rgba(31,74,64,0.18)] backdrop-blur-md"
          : "bg-transparent"
      )}
    >
      <nav className="hilms-container flex items-center justify-between py-3">
        <Logo showTagline />

        <ul className="hidden items-center gap-7 lg:flex">
          {links.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="nav-link text-sm font-semibold text-mutedink hover:text-deept"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/login"
            className="hilms-btn hilms-btn-outline h-10 px-5 text-sm"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="hilms-btn hilms-btn-coral h-10 px-5 text-sm"
          >
            Register
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-xl border border-teal/30 bg-white/70 text-deept lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      <div
        className={cn(
          "overflow-hidden bg-cream/95 backdrop-blur-md transition-all duration-300 lg:hidden",
          open ? "max-h-[520px] border-b border-teal/10" : "max-h-0"
        )}
      >
        <div className="flex flex-col gap-1 px-5 py-4">
          {links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-mutedink hover:bg-softteal hover:text-deept"
            >
              {item.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-teal/10 pt-4">
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="hilms-btn hilms-btn-outline h-11 w-full text-sm"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              onClick={() => setOpen(false)}
              className="hilms-btn hilms-btn-coral h-11 w-full text-sm"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
