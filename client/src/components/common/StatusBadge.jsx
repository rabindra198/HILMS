function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  const styles = {
    confirmed: "bg-teal-pale text-teal-mid border-teal-pale",
    waiting: "bg-coral-pale text-coral-dark border-coral-pale",
    scheduled: "bg-lavender-pale text-lavender border-lavender-pale",
    completed: "bg-teal-pale text-teal-mid border-teal-pale",
    cancelled: "bg-coral-pale text-coral-dark border-coral-pale",
    active: "bg-teal-pale text-teal-mid border-teal-pale",
    inactive: "bg-softteal text-ink-soft border-softteal",
    pending: "bg-coral-pale text-coral-dark border-coral-pale",
    approved: "bg-teal-pale text-teal-mid border-teal-pale",
    rejected: "bg-coral-pale text-coral-dark border-coral-pale",
    processing: "bg-lavender-pale text-lavender border-lavender-pale",
    verified: "bg-teal-pale text-teal-mid border-teal-pale",
    draft: "bg-softteal text-ink-soft border-softteal",
    // A superseded report is retained history, not a current result, so it reads muted.
    superseded: "bg-softteal text-ink-soft border-softteal",
    accepted: "bg-lavender-pale text-lavender border-lavender-pale",
    paid: "bg-teal-pale text-teal-mid border-teal-pale",
    overdue: "bg-coral-pale text-coral-dark border-coral-pale",
    available: "bg-teal-pale text-teal-mid border-teal-pale",
    "on leave": "bg-coral-pale text-coral-dark border-coral-pale",
    normal: "bg-lavender-pale text-lavender border-lavender-pale",
    high: "bg-coral-pale text-coral-dark border-coral-pale",
    low: "bg-coral-pale text-coral-dark border-coral-pale",
    abnormal: "bg-coral-pale text-coral-dark border-coral-pale",
    urgent: "bg-coral-pale text-coral-dark border-coral-pale",
    in_consultation: "bg-lavender-pale text-lavender border-lavender-pale",
  };

  const className = styles[normalized] || "bg-softteal text-ink-soft border-softteal";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-4 ${className}`}>
      {status}
    </span>
  );
}

export { StatusBadge };
