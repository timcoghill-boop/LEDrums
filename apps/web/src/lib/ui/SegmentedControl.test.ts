// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SegmentedControl from './SegmentedControl.svelte';

/* Segmented controls are the app's most common property control (Motion, Per, On, …), and they
   are built on a ToggleGroup, which claims the ARROW keys for roving focus. Those are also the
   app's section-stepping keys, so a control left holding focus after a click quietly takes them
   over. Committing by pointer hands the keyboard back; committing by keyboard does not, because
   that user is still arrowing through the options. */

const OPTS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
];

const segments = (c: Element) => [...c.querySelectorAll('button')];

describe('SegmentedControl', () => {
  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    const { container } = render(SegmentedControl, { props: { value: 'a', options: OPTS, onChange, ariaLabel: 'Pick' } });
    await fireEvent.click(segments(container)[1]!);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('releases focus after a pointer commit, so section arrows still reach the app', async () => {
    const { container } = render(SegmentedControl, { props: { value: 'a', options: OPTS, ariaLabel: 'Pick' } });
    const target = segments(container)[1]!;
    target.focus();
    await fireEvent.click(target);
    expect(document.activeElement, 'no longer parked on the control').not.toBe(target);
  });

  it('keeps focus for a keyboard user still arrowing through the options', async () => {
    const { container } = render(SegmentedControl, { props: { value: 'a', options: OPTS, ariaLabel: 'Pick' } });
    const target = segments(container)[1]!;
    target.focus();
    // jsdom cannot compute :focus-visible — pin the browser's modality signal.
    vi.spyOn(target, 'matches').mockImplementation((sel: string) => sel === ':focus-visible');
    await fireEvent.click(target);
    expect(document.activeElement).toBe(target);
  });
});
