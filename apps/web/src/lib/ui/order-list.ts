/* Pure reordering for {@link ./OrderList.svelte} — kept out of the component so the two ways of
   moving a chip (drag, and ← / → on a focused chip) share one tested implementation. */

/**
 * Move the item at `from` into gap `gap` of the ORIGINAL list (0 = before the first item,
 * `ids.length` = after the last), the same gap convention the Sections drag-and-drop uses.
 * Returns null when the move changes nothing, so callers can skip a no-op commit.
 */
export function moveToGap<T>(ids: readonly T[], from: number, gap: number): T[] | null {
  if (from < 0 || from >= ids.length) return null;
  const target = Math.max(0, Math.min(ids.length, gap));
  // Dropping into the gap just before or just after the item leaves it where it is.
  if (target === from || target === from + 1) return null;
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(target > from ? target - 1 : target, 0, item!);
  return next;
}

/** Move the item at `index` one place left (−1) or right (+1); null at either end. */
export function nudge<T>(ids: readonly T[], index: number, delta: -1 | 1): T[] | null {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}
