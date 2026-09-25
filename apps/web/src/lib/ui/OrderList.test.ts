// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import OrderList from './OrderList.svelte';

/* The drag-to-order chips. The pure reordering is pinned in order-list.test.ts; this pins the wiring
   around it — that each input route commits the order it should, that keyboard users can do
   everything a mouse can, and that focus stays on the chip that moved. */

const items = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'tom1', label: 'Tom 1' },
];

const mount = (onReorder = vi.fn(), disabled = false) => ({ onReorder, ...render(OrderList, { props: { items, onReorder, ariaLabel: 'Through kit order', disabled } }) });
const chips = (container: HTMLElement) => [...container.querySelectorAll('button')];

describe('OrderList', () => {
  it('shows the items in order, each saying where it sits and how to move it', () => {
    const { container } = mount();
    expect(chips(container).map((c) => c.textContent?.trim())).toEqual(['Kick', 'Snare', 'Tom 1']);
    expect(chips(container)[1]!.getAttribute('aria-label')).toBe('Snare, 2 of 3. Arrow keys move it.');
  });

  it('→ moves a chip one place later, ← one place earlier', async () => {
    const { container, onReorder } = mount();
    await fireEvent.keyDown(chips(container)[0]!, { key: 'ArrowRight' });
    expect(onReorder).toHaveBeenLastCalledWith(['snare', 'kick', 'tom1']);
    await fireEvent.keyDown(chips(container)[2]!, { key: 'ArrowLeft' });
    expect(onReorder).toHaveBeenLastCalledWith(['kick', 'tom1', 'snare']);
  });

  it('does nothing past either end', async () => {
    const { container, onReorder } = mount();
    await fireEvent.keyDown(chips(container)[0]!, { key: 'ArrowLeft' });
    await fireEvent.keyDown(chips(container)[2]!, { key: 'ArrowRight' });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('keeps focus on the chip that moved, so it can be nudged again', async () => {
    const onReorder = vi.fn();
    const r = render(OrderList, { props: { items, onReorder, ariaLabel: 'Through kit order' } });
    const kick = chips(r.container)[0]!;
    kick.focus();
    await fireEvent.keyDown(kick, { key: 'ArrowRight' });
    // The parent commits the new order; the list re-renders in it.
    await r.rerender({ items: [items[1]!, items[0]!, items[2]!], onReorder, ariaLabel: 'Through kit order' });
    await tick();
    expect(document.activeElement?.textContent?.trim()).toBe('Kick');
  });

  it('dropping a chip onto another moves it into that gap', async () => {
    const { container, onReorder } = mount();
    const [kick, , tom1] = chips(container);
    await fireEvent.dragStart(kick!);
    await fireEvent.dragOver(tom1!);
    await fireEvent.drop(tom1!);
    // Onto the left half of Tom 1: the gap before it, which once Kick is lifted out is second place.
    expect(onReorder).toHaveBeenCalledWith(['snare', 'kick', 'tom1']);
  });

  it('is inert when disabled', () => {
    const { container } = mount(vi.fn(), true);
    for (const chip of chips(container)) {
      expect(chip.disabled).toBe(true);
      expect(chip.getAttribute('draggable')).toBe('false');
    }
  });
});
