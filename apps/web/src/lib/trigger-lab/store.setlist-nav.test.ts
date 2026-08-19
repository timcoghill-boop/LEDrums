import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerLab } from './store.svelte';
import type { WSClient } from '../ws/client';

/* Relative setlist navigation — what the Setlist / Sections bar arrows fire, and what the
   `nextSong` / `prevSection` global controls fire from a bound MIDI note or OSC address.

   The point of these is that the two front doors CANNOT DISAGREE: both resolve through core's
   `relativeNavTarget`, so "what happens at the end of a song" is decided once. The clamp cases
   below are the ones a live set actually depends on — a stray extra footswitch tap at the end
   of the last song must do nothing, never jump back to song 1. */

class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

const fakeClient = (): WSClient => ({ on() {}, connect() {}, close() {}, send() {} }) as unknown as WSClient;

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

/** A store with two songs: the seeded one (given a second section) plus one more. */
function twoSongStore(): { store: TriggerLab; songA: string; songB: string } {
  const store = new TriggerLab(fakeClient);
  const songA = store.activeSongId;
  store.addSongSection('Second');
  const songB = store.createSong('Encore');
  store.setActiveSong(songA); // createSong activates the new song; start from the top again
  return { store, songA, songB };
}

describe('stepSetlist — section axis', () => {
  it('walks forward and back inside the active song', () => {
    const { store } = twoSongStore();
    const [first, second] = store.activeSong!.sections;
    expect(store.activeSectionId).toBe(first!.id);

    expect(store.stepSetlist('section', 1)).toBe(true);
    expect(store.activeSectionId).toBe(second!.id);
    expect(store.stepSetlist('section', -1)).toBe(true);
    expect(store.activeSectionId).toBe(first!.id);
  });

  it('clamps at both ends instead of wrapping', () => {
    const { store } = twoSongStore();
    const sections = store.activeSong!.sections;

    expect(store.stepSetlist('section', -1)).toBe(false); // already first
    expect(store.activeSectionId).toBe(sections[0]!.id);

    while (store.stepSetlist('section', 1)); // walk to the end
    expect(store.activeSectionId).toBe(sections.at(-1)!.id);
    expect(store.stepSetlist('section', 1)).toBe(false); // already last
  });

  // "Next section" at the end of a song is a clamp, not a song change (core navigation.ts).
  it('never spills into the next song', () => {
    const { store, songA } = twoSongStore();
    while (store.stepSetlist('section', 1));
    expect(store.stepSetlist('section', 1)).toBe(false);
    expect(store.activeSongId).toBe(songA);
  });
});

describe('stepSetlist — song axis', () => {
  it('lands on the target song FIRST section, the same place Program Change recall lands', () => {
    const { store, songB } = twoSongStore();
    store.stepSetlist('section', 1); // start from a non-first section, so "first" is a real claim

    expect(store.stepSetlist('song', 1)).toBe(true);
    expect(store.activeSongId).toBe(songB);
    expect(store.activeSectionId).toBe(store.activeSong!.sections[0]!.id);
  });

  it('clamps at both ends of the setlist', () => {
    const { store, songA, songB } = twoSongStore();
    expect(store.stepSetlist('song', -1)).toBe(false);
    expect(store.activeSongId).toBe(songA);

    store.stepSetlist('song', 1);
    expect(store.stepSetlist('song', 1)).toBe(false);
    expect(store.activeSongId).toBe(songB);
  });
});

describe('canStepSetlist', () => {
  // This is exactly what the arrows disable on, so it must agree with stepSetlist's own verdict.
  it('reports the same verdict stepSetlist acts on', () => {
    const { store } = twoSongStore();
    for (const [axis, delta] of [
      ['section', 1],
      ['section', -1],
      ['song', 1],
      ['song', -1],
    ] as const) {
      const predicted = store.canStepSetlist(axis, delta);
      expect(store.stepSetlist(axis, delta)).toBe(predicted);
      if (predicted) store.stepSetlist(axis, -delta); // put the set back
    }
  });
});
