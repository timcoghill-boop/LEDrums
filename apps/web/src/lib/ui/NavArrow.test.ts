// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import NavArrow from './NavArrow.svelte';

/* NavArrow carries two promises the chrome bars rely on and must not re-decide:
   the accessible label stays the plain verb, and the hover copy names whatever ELSE
   fires the same step (the MIDI/OSC binding) — or invites the reader to bind one. */
describe('NavArrow', () => {
  it('labels itself with the direction and the unit it steps', () => {
    const { getByLabelText } = render(NavArrow, { props: { direction: 'prev', unit: 'section' } });
    expect(getByLabelText('Previous section')).toBeTruthy();
  });

  it('fires onclick when live', async () => {
    const onclick = vi.fn();
    const { getByLabelText } = render(NavArrow, { props: { direction: 'next', unit: 'song', onclick } });
    await fireEvent.click(getByLabelText('Next song'));
    expect(onclick).toHaveBeenCalledOnce();
  });

  // Clamped, not wrapped — and a dead arrow still keeps a tooltip anchor so it can say why
  // (a disabled button's own pointer events are off; the anchor takes the hover). The copy
  // itself is pinned in nav-arrow-tip.test.ts, where it is a pure string.
  it('goes dead rather than wrapping, and keeps the anchor that explains it', () => {
    const { getByLabelText } = render(NavArrow, {
      props: { direction: 'next', unit: 'song', disabled: true, bindingInvite: 'bind in Settings' },
    });
    const btn = getByLabelText('Next song') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.closest('.tt-anchor')).toBeTruthy();
  });
});
