export function SectionHeader({ badge, title, description, centered = true }) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {badge && (
        <span className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-white px-4 py-1.5 text-sm font-bold text-teal shadow-sm">
          {badge}
        </span>
      )}
      <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-mutedink sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
