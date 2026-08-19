/* The copy a {@link NavArrow} shows — pure, so the wording is pinned by a test rather than by
   reading a tooltip out of a portal on hover.

   The two strings are deliberately DIFFERENT things and must not be merged: `navArrowLabel` is
   the accessible name (a screen reader wants the verb — "Next song"), while `navArrowTip` is the
   hover copy, which also carries why the button is dead and what else fires it. */

export type NavArrowDirection = 'prev' | 'next';

/** The accessible name: the plain verb, nothing else. */
export function navArrowLabel(direction: NavArrowDirection, unit: string): string {
  return `${direction === 'prev' ? 'Previous' : 'Next'} ${unit}`;
}

/**
 * The hover copy: what the press does · why it can't right now · what else fires it.
 *
 * The order is FIXED across every state. Two arrows sit inches apart on the same row, and
 * reordering the parts per state would move the fact the reader is scanning for out from under
 * their eye as they cross from one to the other.
 *
 * `binding` wins over `invite` when both are supplied — an arrow that already has a MIDI note
 * has nothing to invite. Absent both, the tip is just the label.
 */
export function navArrowTip(
  direction: NavArrowDirection,
  unit: string,
  disabled: boolean,
  binding?: string | null,
  invite?: string | null,
): string {
  return [navArrowLabel(direction, unit), disabled ? `no ${unit} that way` : null, binding || invite || null]
    .filter(Boolean)
    .join(' · ');
}
