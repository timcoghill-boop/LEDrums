// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseFocusAfterPointerCommit } from './release-focus';

/* The performance keys (1–9 fire the active section's graphs, ←/→ step sections) are
   window-level, so any control that keeps focus after a click swallows them — a Select
   trigger runs typeahead over labels that all start with digits, a ToggleGroup claims the
   arrows. This releases focus after a POINTER commit, and only then. */

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** A focused button whose `:focus-visible` state we can dictate, since jsdom has no modality. */
function focusedButton(focusVisible: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  document.body.append(btn);
  btn.focus();
  vi.spyOn(btn, 'matches').mockImplementation((sel: string) => (sel === ':focus-visible' ? focusVisible : false));
  return btn;
}

describe('releaseFocusAfterPointerCommit', () => {
  it('releases focus after a pointer commit, so the next number key reaches the app', () => {
    const btn = focusedButton(false);
    expect(document.activeElement).toBe(btn);
    releaseFocusAfterPointerCommit();
    expect(document.activeElement, 'focus handed back').not.toBe(btn);
  });

  it('leaves a KEYBOARD user alone — blurring would strand them mid-navigation', () => {
    const btn = focusedButton(true);
    releaseFocusAfterPointerCommit();
    expect(document.activeElement, 'still theirs to arrow through').toBe(btn);
  });

  it('releases when the engine cannot answer :focus-visible, rather than trapping the keys', () => {
    const btn = focusedButton(false);
    vi.spyOn(btn, 'matches').mockImplementation(() => {
      throw new Error('unsupported selector');
    });
    releaseFocusAfterPointerCommit();
    expect(document.activeElement).not.toBe(btn);
  });

  it('is a no-op when nothing holds focus', () => {
    expect(() => releaseFocusAfterPointerCommit()).not.toThrow();
  });
});
