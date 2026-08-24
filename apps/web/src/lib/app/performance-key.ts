/* Performance-key decision logic, split out of App.svelte so it is unit-testable — the
   `decideDeleteKey` precedent next door.

   The keys: 1–9 (0 → the tenth) fire the active section's graphs, and ←/→ step through the
   active song's sections. They are the show-running keys, so they must behave the same
   whatever happens to be focused.

   Why CLAIMING matters, and not just handling. The window listener is already capture-phase,
   so it sees the key before the focused control does — but firing the graph and then letting
   the event continue means the control acts on it TOO. A bits-ui Select trigger runs combobox
   typeahead, and the division labels in this app all start with a digit (`1/2`, `1/4`,
   `2 bars`), so pressing 1 for a cue re-picked the Rate division at the same time. A
   ToggleGroup (every segmented control) claims the arrows for roving focus, so ←/→ moved
   between Motion options instead of stepping sections. Neither depends on HOW the control
   got focus, which is why releasing focus after a click was not enough on its own: confirming
   a value with Return leaves focus on the control by design, and the same theft resumed.

   So: when the app acts on one of these keys it also stops the event. The cost is losing
   digit typeahead inside a Select, which is worth it — you can still open the list and arrow
   to an option, and nobody expects the number keys to do two things at once mid-show.

   Editable text is the one exemption: digits typed into a field are the point of the field. */

export type SectionStep = -1 | 1;

export interface PerformanceKeyInput {
  key: string;
  /** True when focus is in an input / textarea / contenteditable — see `isEditableShortcutTarget`. */
  isEditableTarget: boolean;
  /** True while the Settings modal is open; the workspace behind it must not act. */
  settingsOpen: boolean;
  /** True when the event came from inside the xyflow canvas, which owns the arrows to nudge
      a selected node. Digits are still the app's there — the canvas does nothing with them. */
  inFlowCanvas: boolean;
}

export interface PerformanceKeyDecision {
  /** Index into the active section's graph list, when a digit fired one. */
  fireGraphIndex?: number;
  /** Direction to step the active song's sections, when an arrow asked for it. */
  sectionStep?: SectionStep;
  /** The caller must `preventDefault()` AND `stopPropagation()` — otherwise the focused
      control acts on the same key straight after. */
  claim: boolean;
}

const NOTHING: PerformanceKeyDecision = { claim: false };

export function decidePerformanceKey(input: PerformanceKeyInput): PerformanceKeyDecision {
  if (input.isEditableTarget || input.settingsOpen) return NOTHING;

  if (/^[0-9]$/.test(input.key)) {
    // `0` is the tenth graph, so the row reads 1…9,0 the way a keyboard does.
    return { fireGraphIndex: input.key === '0' ? 9 : Number(input.key) - 1, claim: true };
  }

  if (input.key === 'ArrowLeft' || input.key === 'ArrowRight') {
    if (input.inFlowCanvas) return NOTHING; // the canvas nudges the selected node with these
    return { sectionStep: input.key === 'ArrowRight' ? 1 : -1, claim: true };
  }

  return NOTHING;
}
