import {
  PageShell,
  PageCard,
  TableState,
  ResponsiveList,
  TrustNote,
} from "@/components/common/PageShell";
import { StatusBadge } from "@/components/common/StatusBadge";

export function AdminPageShell(props) {
  return <PageShell {...props} />;
}

export function AdminCard(props) {
  return <PageCard {...props} />;
}

export function AdminTableState(props) {
  return <TableState {...props} />;
}

export function AdminResponsiveList(props) {
  return <ResponsiveList {...props} />;
}

export function AdminTrustNote() {
  return (
    <TrustNote message="Administrative actions are logged for audit and compliance purposes." />
  );
}

export { StatusBadge };

