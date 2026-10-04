/**
 * Backwards-compatible aliases for the shared laboratory page chrome.
 *
 * The single implementation now lives in `./LabPageShell` (which itself wraps
 * `components/common/PageShell`). This module only re-exports it so the older
 * `import { ... } from "./labUi"` call sites keep working without a second copy
 * of the wrappers drifting out of sync.
 */
export {
  LabPageShell,
  LabCard,
  LabTableState,
  LabResponsiveList,
  LabTrustNote,
} from "./LabPageShell";
