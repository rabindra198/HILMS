function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const styles = {
    confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    waiting: "bg-amber-50 text-amber-700 border-amber-200",
    scheduled: "bg-sky-50 text-sky-700 border-sky-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive: "bg-gray-50 text-gray-700 border-gray-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    processing: "bg-sky-50 text-sky-700 border-sky-200",
    verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
    accepted: "bg-blue-50 text-blue-700 border-blue-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    overdue: "bg-red-50 text-red-700 border-red-200",
    available: "bg-emerald-50 text-emerald-700 border-emerald-200",
    "on leave": "bg-red-50 text-red-700 border-red-200",
    normal: "bg-sky-50 text-sky-700 border-sky-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    urgent: "bg-red-50 text-red-700 border-red-200",
    in_consultation: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const className = styles[normalized] || "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

export { StatusBadge };
