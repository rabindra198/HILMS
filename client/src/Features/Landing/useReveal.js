import { useEffect } from "react";

export function useReveal(selector = ".reveal, .stagger") {
  useEffect(() => {
    const els = document.querySelectorAll(selector);
    if (!els.length) return;

    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("reveal-active"));
      els.forEach((el) => el.classList.add("stagger-active"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-active");
            entry.target.classList.add("stagger-active");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [selector]);
}
