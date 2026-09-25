<script lang="ts">
  /* A short sequence the author puts in order — which drum lights first, second, third. Each item
     is a chip: drag it to a new place, or focus it and press ← / → to nudge it one step. Both routes
     share the pure `moveToGap` / `nudge` in `order-list.ts`, so they cannot disagree about where an
     item lands. Native HTML5 drag-and-drop with a private data type, the same mechanism the Sections
     view uses, so it behaves identically in the browser and the desktop webview.

     The drop gap is decided PER CHIP (the pointer's side of that chip's midpoint) rather than from a
     single axis across the row, so it stays right when the chips wrap onto a second line. */
  import { moveToGap, nudge } from './order-list';

  type Item = { id: string; label: string };

  let {
    items,
    onReorder,
    ariaLabel,
    disabled = false,
  }: {
    /** The items IN THEIR CURRENT ORDER — the first fires first. */
    items: Item[];
    /** Called with every id in the new order after a drag or a nudge. */
    onReorder: (ids: string[]) => void;
    ariaLabel: string;
    disabled?: boolean;
  } = $props();

  const DRAG_TYPE = 'application/x-ledrums-order';

  let dragFrom = $state<number | null>(null);
  let dropGap = $state<number | null>(null);
  /** The chip to refocus, and the items array it moved FROM — so focus is restored only once the
      parent has committed the new order, not before (moving a focused node in the DOM drops focus). */
  // `raw`: a deep $state would PROXY the stored array, and a proxy is never `===` the items prop,
  // so the "has the new order arrived?" check below would pass at once and refocus too early.
  let refocus = $state.raw<{ id: string; from: Item[] } | null>(null);
  let list: HTMLOListElement | undefined = $state();

  const ids = $derived(items.map((item) => item.id));

  // After a keyboard nudge the list re-renders in its new order; keep focus on the chip that moved
  // so ← / → can be pressed again and again without hunting for it. Waits for the NEW items: running
  // on the old ones would focus the chip and then lose it as the keyed list moves its node.
  $effect(() => {
    const pending = refocus;
    if (!pending || items === pending.from) return;
    // Found by id, not by position: the keyed list has just moved nodes around.
    for (const chip of list?.querySelectorAll<HTMLButtonElement>('button[data-id]') ?? []) {
      if (chip.dataset.id === pending.id) chip.focus();
    }
    refocus = null;
  });

  function commit(next: string[] | null): void {
    if (next) onReorder(next);
  }

  function gapFor(event: DragEvent, index: number): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2 ? index + 1 : index;
  }

  function onKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = nudge(ids, index, event.key === 'ArrowLeft' ? -1 : 1);
    if (!next) return;
    refocus = { id: ids[index]!, from: items };
    commit(next);
  }

  function endDrag(): void {
    dragFrom = null;
    dropGap = null;
  }
</script>

<ol class="orderlist" aria-label={ariaLabel} bind:this={list}>
  {#each items as item, i (item.id)}
    <li class="slot">
      <button
        data-id={item.id}
        type="button"
        class="chip"
        class:dragging={dragFrom === i}
        class:drop-before={dropGap === i && dragFrom !== null}
        class:drop-after={dropGap === i + 1 && i === items.length - 1 && dragFrom !== null}
        draggable={!disabled}
        {disabled}
        aria-label="{item.label}, {i + 1} of {items.length}. Arrow keys move it."
        onkeydown={(e) => onKey(e, i)}
        ondragstart={(e) => {
          dragFrom = i;
          e.dataTransfer?.setData(DRAG_TYPE, item.id);
          e.dataTransfer?.setData('text/plain', item.label);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        }}
        ondragover={(e) => {
          if (dragFrom === null) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          dropGap = gapFor(e, i);
        }}
        ondrop={(e) => {
          e.preventDefault();
          if (dragFrom !== null) commit(moveToGap(ids, dragFrom, gapFor(e, i)));
          endDrag();
        }}
        ondragend={endDrag}
      >
        {item.label}
      </button>
      {#if i < items.length - 1}<span class="sep" aria-hidden="true">›</span>{/if}
    </li>
  {/each}
</ol>

<style>
  .orderlist {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .slot {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .chip {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-2);
    white-space: nowrap;
    cursor: grab;
    transition-property: opacity, box-shadow, scale;
    transition-duration: var(--dur-120);
    transition-timing-function: ease;
  }
  .chip:active {
    cursor: grabbing;
    scale: 0.96;
  }
  .chip:hover {
    border-color: var(--text-faint);
  }
  .chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  /* The chip being carried fades, so the drop marker reads as the place it will land. */
  .chip.dragging {
    opacity: 0.4;
  }
  /* The landing marker: a bar of accent on the side of the chip the item will go. */
  .chip.drop-before {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .chip.drop-after {
    box-shadow: inset -3px 0 0 var(--accent);
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }
  .sep {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
</style>
