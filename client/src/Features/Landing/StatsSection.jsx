import { useEffect, useRef, useState } from "react";

const stats = [
  { value: 5, suffix: "", label: "Healthcare Roles", note: "Patient · Doctor · Lab · Admin" },
  { value: 1, suffix: "", label: "Connected Platform", note: "One place for everything" },
  { value: 8, suffix: "+", label: "Core Modules", note: "Appointments to reports" },
  { value: 24, suffix: "/7", label: "Record Access", note: "Digital medical history" },
];

function Counter({ end, suffix }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setN(end);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const duration = 1200;
          const start = performance.now();
          const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            setN(Math.round(end * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return (
    <span ref={ref} className="text-5xl font-extrabold text-deept sm:text-6xl">
      {n}
      {suffix}
    </span>
  );
}

export function StatsSection() {
  return (
    <section className="py-20 lg:py-24">
      <div className="hilms-container">
        <div className="stagger grid gap-6 rounded-[30px] border border-white/70 bg-gradient-to-br from-softcream via-softteal/60 to-softlavender/60 p-8 shadow-[0_20px_50px_-20px_rgba(31,74,64,0.3)] sm:grid-cols-2 lg:grid-cols-4 lg:p-12">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <Counter end={s.value} suffix={s.suffix} />
              <p className="mt-2 text-lg font-bold text-teal">{s.label}</p>
              <p className="mt-1 text-xs font-medium text-mutedink">{s.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
