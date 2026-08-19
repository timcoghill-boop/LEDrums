import { describe, expect, it } from 'vitest';
import { navArrowLabel, navArrowTip } from './nav-arrow-tip';

describe('nav arrow copy', () => {
  it('names the direction and the unit', () => {
    expect(navArrowLabel('prev', 'song')).toBe('Previous song');
    expect(navArrowLabel('next', 'section')).toBe('Next section');
  });

  it('names the binding that also fires the step', () => {
    expect(navArrowTip('next', 'song', false, 'MIDI C1 · /ledrums/next_song')).toBe(
      'Next song · MIDI C1 · /ledrums/next_song',
    );
  });

  it('invites a binding only when there is none', () => {
    expect(navArrowTip('next', 'song', false, null, 'bind in Settings → Controls')).toBe(
      'Next song · bind in Settings → Controls',
    );
    // Already bound: the invitation would be noise, and wrong.
    expect(navArrowTip('next', 'song', false, 'MIDI C1', 'bind in Settings → Controls')).toBe('Next song · MIDI C1');
  });

  it('says why a clamped arrow is dead, before saying what else fires it', () => {
    expect(navArrowTip('prev', 'section', true, 'MIDI B0')).toBe('Previous section · no section that way · MIDI B0');
  });

  it('degrades to the bare label when there is nothing else to say', () => {
    expect(navArrowTip('prev', 'song', false)).toBe('Previous song');
  });
});
