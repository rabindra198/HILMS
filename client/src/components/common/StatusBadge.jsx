function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const styles = {
    confirmed: "bg-teal-pale text-teal-mid border-teal-pale",
    waiting: "bg-coral-pale text-coral-dark border-coral-pale",
    scheduled: "bg-lavender-pale text-lavender border-lavender-pale",
    completed: "bg-teal-pale text-teal-mid border-teal-pale",
    cancelled: "bg-coral-pale text-coral-dark border-coral-pale",
    active: "bg-teal-pale text-teal-mid border-teal-pale",
    inactive: "bg-sand text-ink-soft border-sand",
    pending: "bg-coral-pale text-coral-dark border-coral-pale",
    processing: "bg-lavender-pale text-lavender border-lavender-pale",
    verified: "bg-teal-pale text-teal-mid border-teal-pale",
    accepted: "bg-lavender-pale text-lavender border-lavender-pale",
    paid: "bg-teal-pale text-teal-mid border-teal-pale",
    overdue: "bg-coral-pale text-coral-dark border-coral-pale",
    available: "bg-teal-pale text-teal-mid border-teal-pale",
    "on leave": "bg-coral-pale text-coral-dark border-coral-pale",
    normal: "bg-lavender-pale text-lavender border-lavender-pale",
    high: "bg-sand text-coral-dark border-sand",
    urgent: "bg-coral-pale text-coral-dark border-coral-pale",
    in_consultation: "bg-lavender-pale text-lavender border-lavender-pale",
  };

  const className = styles[normalized] || "bg-sand text-ink-soft border-sand";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

export { StatusBadge };
