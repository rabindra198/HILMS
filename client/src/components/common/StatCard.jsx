function StatCard({ title, value, trend, trendUp, description, icon: Icon, variant = "teal" }) {
  const variants = {
    teal: {
      bg: "bg-white",
      iconBg: "bg-deept/5",
      iconColor: "text-ink-soft",
    },
    lavender: {
      bg: "bg-white",
      iconBg: "bg-deept/5",
      iconColor: "text-ink-soft",
    },
    sand: {
      bg: "bg-white",
      iconBg: "bg-deept/5",
      iconColor: "text-ink-soft",
    },
    coral: {
      bg: "bg-white",
      iconBg: "bg-deept/5",
      iconColor: "text-ink-soft",
    },
  };

  const style = variants[variant] || variants.teal;

  return (
    <div className={`rounded-2xl border-2 border-deept/10 ${style.bg} p-5 transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-soft">{title}</p>
          <p className="font-heading text-3xl font-extrabold text-teal-deep">{value}</p>
          {trend && (
            <p className={`text-xs font-bold ${trendUp ? "text-teal-mid" : "text-coral-dark"}`}>
              {trendUp ? "↑" : "↓"} {trend}
            </p>
          )}
          {description && <p className="text-xs font-medium text-ink-soft">{description}</p>}
        </div>
        <div className={`flex size-12 items-center justify-center rounded-xl ${style.iconBg}`}>
          <Icon className={`size-6 ${style.iconColor}`} />
        </div>
      </div>
    </div>
  );
}

export { StatCard };
