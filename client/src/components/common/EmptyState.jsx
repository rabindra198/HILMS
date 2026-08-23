import { Search, FileSearch, Users, Calendar, FlaskConical, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const iconMap = {
  search: Search,
  file: FileSearch,
  users: Users,
  calendar: Calendar,
  lab: FlaskConical,
  billing: CreditCard,
};

function EmptyState({ title, description, actionLabel, onAction, icon = "search" }) {
  const Icon = iconMap[icon] || Search;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
