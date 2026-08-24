import { describe, expect, it } from 'vitest';
import { decidePerformanceKey, type PerformanceKeyInput } from './performance-key';

/* The show-running keys: 1–9 (0 → the tenth) fire the active section's graphs, ←/→ step
   sections. The property under test is not "does it act" but "does it CLAIM" — the window
   listener is capture-phase, so an unclaimed key reaches the focused control immediately
   afterwards and gets acted on twice. That is the bug Trent hit: a digit fired the cue AND
   retyped the Rate division, because a Select trigger runs typeahead over labels that all
   start with a digit. */

const at = (over: Partial<PerformanceKeyInput> = {}): PerformanceKeyInput => ({
  key: '1',
  isEditableTarget: false,
  settingsOpen: false,
  inFlowCanvas: false,
  ...over,
});

describe('decidePerformanceKey — digits', () => {
  it('fires the matching graph and claims the key', () => {
    expect(decidePerformanceKey(at({ key: '1' }))).toEqual({ fireGraphIndex: 0, claim: true });
    expect(decidePerformanceKey(at({ key: '9' }))).toEqual({ fireGraphIndex: 8, claim: true });
  });

  it('reads 0 as the tenth, so the row runs 1…9,0 like the keyboard', () => {
    expect(decidePerformanceKey(at({ key: '0' }))).toEqual({ fireGraphIndex: 9, claim: true });
  });

  it('claims regardless of HOW the focused control was reached', () => {
    // The reason releasing focus after a click was not enough on its own: confirming a value
    // with Return leaves focus on the control by design, so the theft resumed on the next
    // digit. The decision cannot see focus at all — which is the point.
    for (const key of ['1', '5', '0']) {
      expect(decidePerformanceKey(at({ key })).claim, key).toBe(true);
    }
  });

  it('leaves digits alone in editable text, where typing them is the point', () => {
    expect(decidePerformanceKey(at({ key: '4', isEditableTarget: true }))).toEqual({ claim: false });
  });

  it('acts on nothing behind the Settings modal', () => {
    expect(decidePerformanceKey(at({ key: '4', settingsOpen: true }))).toEqual({ claim: false });
  });

  it('still owns digits inside the flow canvas — the canvas does nothing with them', () => {
    expect(decidePerformanceKey(at({ key: '2', inFlowCanvas: true }))).toEqual({ fireGraphIndex: 1, claim: true });
  });
});

describe('decidePerformanceKey — section arrows', () => {
  it('steps the sections and claims the key', () => {
    expect(decidePerformanceKey(at({ key: 'ArrowRight' }))).toEqual({ sectionStep: 1, claim: true });
    expect(decidePerformanceKey(at({ key: 'ArrowLeft' }))).toEqual({ sectionStep: -1, claim: true });
  });

  it('yields the arrows to the flow canvas, which nudges the selected node', () => {
    expect(decidePerformanceKey(at({ key: 'ArrowRight', inFlowCanvas: true }))).toEqual({ claim: false });
  });

  it('yields the arrows inside editable text, for caret movement', () => {
    expect(decidePerformanceKey(at({ key: 'ArrowLeft', isEditableTarget: true }))).toEqual({ claim: false });
  });
});

describe('decidePerformanceKey — everything else', () => {
  it('claims nothing it does not act on, so other handlers still see the key', () => {
    for (const key of ['Enter', 'Escape', 'a', 'ArrowUp', 'Backspace', ' ']) {
      expect(decidePerformanceKey(at({ key })), key).toEqual({ claim: false });
    }
  });
});
