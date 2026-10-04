import { PageShell, PageCard, TableState, ResponsiveList, TrustNote } from "@/components/common/PageShell";

/**
 * Laboratory-prefixed aliases of the shared page chrome.
 *
 * The implementation lives in `components/common/PageShell.jsx` because the
 * Doctor module now needs the identical shell. These names are kept because every
 * laboratory screen imports them and their `Lab*` names read correctly there -
 * rewriting seven working screens for a rename would be churn, not value.
 */
export function LabPageShell(props) {
  return <PageShell {...props} />;
}

export function LabCard(props) {
  return <PageCard {...props} />;
}

export function LabTableState(props) {
  return <TableState {...props} />;
}

export function LabResponsiveList(props) {
  return <ResponsiveList {...props} />;
}

export function LabTrustNote() {
  return <TrustNote message="Results are handled securely and shared only with authorized care teams." />;
}
