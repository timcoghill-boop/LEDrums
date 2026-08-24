/**
 * Hand the keyboard back to the app after a control has been committed by POINTER.
 *
 * This app's window-level keys are performance keys: 1–9 fire the active section's graphs and
 * ←/→ step through sections. A control that keeps focus after a click silently swallows them —
 * a bits-ui Select trigger runs combobox typeahead (and most option labels here start with a
 * digit: `1/2`, `1/4`, `2 bars`), and a ToggleGroup claims the arrows for roving focus. So
 * clicking a property and then reaching for the number keys edits the property instead of
 * firing the cue, mid-show.
 *
 * Only POINTER commits release focus. A keyboard user is mid-navigation — blurring them would
 * strand them and break arrowing through a segmented control. `:focus-visible` is the browser's
 * own modality signal, so no listener or heuristic of ours is needed to tell the two apart.
 */
export function releaseFocusAfterPointerCommit(): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || typeof active.blur !== 'function') return;
  try {
    // Focus arrived by keyboard → leave it alone.
    if (typeof active.matches === 'function' && active.matches(':focus-visible')) return;
  } catch {
    // An engine without :focus-visible support: fall through and release, which is the
    // behaviour the performance keys need. Every browser this ships in supports it.
  }
  active.blur();
}
