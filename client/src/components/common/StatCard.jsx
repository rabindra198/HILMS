function StatCard({ title, value, trend, trendUp, description, icon: Icon, color = "blue" }) {
  const colorMap = {
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-emerald-500/10 text-emerald-600",
    orange: "bg-orange-500/10 text-orange-600",
    purple: "bg-purple-500/10 text-purple-600",
    red: "bg-red-500/10 text-red-600",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {trend && (
            <p className={`text-xs font-medium ${trendUp ? "text-emerald-600" : "text-red-600"}`}>
              {trendUp ? "↑" : "↓"} {trend}
            </p>
          )}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={`flex size-10 items-center justify-center rounded-lg ${colorMap[color]}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

export { StatCard };
