import { describe, expect, it } from 'vitest';
import { moveToGap, nudge } from './order-list';

/* The two ways a chip moves in an OrderList. Worth pinning because the gap convention is easy to
   get off by one: gaps count the ORIGINAL list, so dragging an item rightwards lands one place
   earlier than the gap number once it has been lifted out. */

const drums = ['kick', 'snare', 'tom1', 'tom2'];

describe('moveToGap', () => {
  it('moves an item leftwards into the gap before another', () => {
    expect(moveToGap(drums, 3, 0)).toEqual(['tom2', 'kick', 'snare', 'tom1']);
  });

  it('moves an item rightwards, accounting for its own removal', () => {
    // Gap 3 is "before tom2" in the original list.
    expect(moveToGap(drums, 0, 3)).toEqual(['snare', 'tom1', 'kick', 'tom2']);
  });

  it('can move an item to the very end', () => {
    expect(moveToGap(drums, 1, 4)).toEqual(['kick', 'tom1', 'tom2', 'snare']);
  });

  it('is a no-op for the gaps either side of the item itself', () => {
    expect(moveToGap(drums, 2, 2)).toBeNull();
    expect(moveToGap(drums, 2, 3)).toBeNull();
  });

  it('never loses or duplicates an item', () => {
    for (let from = 0; from < drums.length; from++) {
      for (let gap = 0; gap <= drums.length; gap++) {
        const out = moveToGap(drums, from, gap) ?? drums;
        expect([...out].sort()).toEqual([...drums].sort());
      }
    }
  });
});

describe('nudge', () => {
  it('swaps with the neighbour on the given side', () => {
    expect(nudge(drums, 1, -1)).toEqual(['snare', 'kick', 'tom1', 'tom2']);
    expect(nudge(drums, 1, 1)).toEqual(['kick', 'tom1', 'snare', 'tom2']);
  });

  it('refuses to move past either end', () => {
    expect(nudge(drums, 0, -1)).toBeNull();
    expect(nudge(drums, 3, 1)).toBeNull();
  });
});
