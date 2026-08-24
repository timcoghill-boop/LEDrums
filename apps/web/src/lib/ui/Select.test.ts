// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Select from './Select.svelte';

/* F3 item 10: a short choice is not a dropdown. Four options or fewer render as a segmented
   control, decided HERE so the rule holds at every call site and reverses by itself when a
   registry grows past four. The exclusions matter as much as the rule — an action picker has
   no state to segment, and a list of names the app didn't author clips rather than ellipsises. */

const OPTS = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: `o${i}`, label: `Opt ${i}` }));

const seg = (c: Element) => c.querySelector('.sel-as-seg');
const drop = (c: Element) => c.querySelector('.sel-trigger');

describe('Select — segmented at four options or fewer', () => {
  it('segments two, three and four options', () => {
    for (const n of [2, 3, 4]) {
      const { container } = render(Select, { props: { value: 'o0', options: OPTS(n), ariaLabel: 'Pick' } });
      expect(seg(container), `${n} options`).not.toBeNull();
      expect(drop(container), `${n} options`).toBeNull();
    }
  });

  it('stays a dropdown at five', () => {
    const { container } = render(Select, { props: { value: 'o0', options: OPTS(5), ariaLabel: 'Pick' } });
    expect(seg(container)).toBeNull();
    expect(drop(container)).not.toBeNull();
  });

  it('stays a dropdown for a single option — one segment is a dead button', () => {
    const { container } = render(Select, { props: { value: 'o0', options: OPTS(1), ariaLabel: 'Pick' } });
    expect(seg(container)).toBeNull();
  });

  it('stays a dropdown for an ACTION picker sitting on its placeholder', () => {
    const { container } = render(Select, {
      props: { value: '', options: OPTS(3), placeholder: 'Add parameter…', ariaLabel: 'Add' },
    });
    expect(seg(container)).toBeNull();
    expect(drop(container)).not.toBeNull();
  });

  it('stays a dropdown when the call site opts out', () => {
    const { container } = render(Select, {
      props: { value: 'o0', options: OPTS(3), segment: false, ariaLabel: 'Pick' },
    });
    expect(seg(container)).toBeNull();
  });

  it('publishes the chosen value from a segment, like the dropdown does', async () => {
    const onChange = vi.fn();
    const { getByText } = render(Select, { props: { value: 'o0', options: OPTS(3), onChange, ariaLabel: 'Pick' } });
    await fireEvent.click(getByText('Opt 2'));
    expect(onChange).toHaveBeenCalledWith('o2');
  });

  it('renders every option label — icons would replace them', () => {
    const { getByText } = render(Select, { props: { value: 'o0', options: OPTS(3), ariaLabel: 'Pick' } });
    for (const label of ['Opt 0', 'Opt 1', 'Opt 2']) expect(getByText(label)).toBeTruthy();
  });
});

/* The performance keys (1–9 fire the active section's graphs) are window-level, so a control
   that keeps focus after a click swallows them. A dropdown trigger is the worst offender: it
   runs combobox typeahead, and the division labels this app puts in Selects all START with a
   digit ("1/2", "1/4", "2 bars"), so reaching for a cue key re-picked the value instead. */
describe('Select — hands the keyboard back', () => {
  it('releases focus when a segment is chosen by pointer', async () => {
    const { container } = render(Select, { props: { value: 'o0', options: OPTS(3), ariaLabel: 'Pick' } });
    const buttons = [...container.querySelectorAll('button')];
    const target = buttons[1]!;
    target.focus();
    expect(document.activeElement).toBe(target);
    await fireEvent.click(target);
    expect(document.activeElement, 'focus is no longer parked on the control').not.toBe(target);
  });

  it('keeps focus for a keyboard user, who is still navigating', async () => {
    const { container } = render(Select, { props: { value: 'o0', options: OPTS(3), ariaLabel: 'Pick' } });
    const buttons = [...container.querySelectorAll('button')];
    const target = buttons[1]!;
    target.focus();
    // :focus-visible is the browser's own modality signal; jsdom cannot compute it, so pin it.
    vi.spyOn(target, 'matches').mockImplementation((sel: string) => sel === ':focus-visible');
    await fireEvent.click(target);
    expect(document.activeElement, 'left alone mid-navigation').toBe(target);
  });
});
