import { describe, expect, it } from 'vitest';
import { parseKit } from '../geometry/kit-schema';
import { buildPixelModel, type PixelModel } from '../geometry/pixel-model';
import type { TransportState } from '../engine/render-context';
import { createVoiceBusEngine, type InputEvent } from './engine';
import { orderedByPattern, resolveSplices, sequenceRanks, spliceDrumRanks, spliceOrderIndex, spliceUnitOrder, type SplicePartitionUnit } from './splice';
import { padKey, type GraphNode, type SpliceConfig, type TriggerGraph } from './types';

/* MOVE THROUGH's dragged order: the author picks exactly which drum (THROUGH KIT) or hoop (THROUGH
   DRUM) lights first, second, third. The part worth pinning hardest is that a sequence is always a
   PERMUTATION — a stale or partial one can never lengthen the cascade or drop a drum — and that the
   engine really fires in the dragged order, on a Splice and on a Slice. */

function node(kind: GraphNode['kind'], id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id, kind, x: 0, y: 0, mode: 'oneshot', scope: 'kit', effectId: '', presetId: '', busId: '', params: {}, env: {},
    noRepeat: true, on: 'value', valueMode: 'gate', threshold: 0.5, invert: false, bands: [0.5], p: 0.5,
    delayMode: 'time', ms: 0, division: '1/8', ...over,
  };
}

describe('sequenceRanks', () => {
  const ids = ['kick', 'snare', 'tom1', 'tom2'];

  it('ranks the named ids in the order given', () => {
    expect(sequenceRanks(ids, ['tom2', 'kick', 'tom1', 'snare'])).toEqual([1, 3, 2, 0]);
  });

  it('puts ids the sequence left out after it, in model order', () => {
    // A drum added to the kit after the order was dragged joins at the end, never vanishes.
    expect(sequenceRanks(ids, ['tom1'])).toEqual([1, 2, 0, 3]);
  });

  it('drops unknown and repeated ids, so the result is always a permutation', () => {
    const ranks = sequenceRanks(ids, ['ghost', 'snare', 'snare', 'kick']);
    expect([...ranks].sort()).toEqual([0, 1, 2, 3]);
    expect(ranks[1]).toBe(0); // snare first
    expect(ranks[0]).toBe(1); // then kick
  });
});

describe('orderedByPattern', () => {
  it('is the inverse of the pattern ranking — the chips read in firing order', () => {
    for (const order of ['up', 'down', 'outside-in', 'random'] as const) {
      const seq = orderedByPattern(5, order, 7);
      seq.forEach((ordinal, rank) => expect(spliceOrderIndex(ordinal, 5, order, 7), order).toBe(rank));
    }
  });
});

describe('spliceUnitOrder', () => {
  const model = buildPixelModel(
    parseKit({
      global: { ledDensityPxPerM: 30, hoopCount: 3, defaultHoopSpacingMm: 50 },
      drums: [
        { id: 'kick', diameterIn: 12, pixelsPerHoop: 4, hoopSpacingMm: 50, origin: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        { id: 'snare', diameterIn: 10, pixelsPerHoop: 4, hoopSpacingMm: 50, origin: { x: 300, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      ],
    }),
  );
  const unit = (over: Partial<SplicePartitionUnit>): SplicePartitionUnit => ({
    start: 0, end: 4, index: 0, ordinal: 0, ordinalCount: 3, drumOrdinal: 0, drumCount: 2, ...over,
  });
  const cfg = (over: Partial<SpliceConfig>): SpliceConfig => ({ ...resolveSplices(node('splice', 's', { splices: [{ color: '#fff' }] }), 120)!.config, ...over });

  it('a drum sequence decides the drum axis of a hoop cut', () => {
    const c = cfg({ drumSequence: ['snare', 'kick'] });
    const ranks = spliceDrumRanks(model, c);
    expect(spliceUnitOrder(unit({ drumOrdinal: 0 }), c, ranks).drumOrderIndex, 'kick second').toBe(1);
    expect(spliceUnitOrder(unit({ drumOrdinal: 1 }), c, ranks).drumOrderIndex, 'snare first').toBe(0);
  });

  it('a drum sequence decides the PRIMARY axis of a drum cut, where the drums are the units', () => {
    const c = cfg({ partition: 'drum', drumSequence: ['snare', 'kick'] });
    const ranks = spliceDrumRanks(model, c);
    expect(spliceUnitOrder(unit({ ordinal: 1, ordinalCount: 2, drumOrdinal: 1 }), c, ranks).orderIndex).toBe(0);
  });

  it('a hoop sequence decides the primary axis of a hoop cut', () => {
    const c = cfg({ hoopSequence: [3, 1, 2] });
    const order = (hoop: number) => spliceUnitOrder(unit({ ordinal: hoop - 1 }), c, null).orderIndex;
    expect([order(1), order(2), order(3)]).toEqual([1, 2, 0]); // hoop 3 fires first
  });

  it('without a sequence, the patterns are exactly what they were', () => {
    const c = cfg({ order: 'down', drumOrder: 'down' });
    const o = spliceUnitOrder(unit({ ordinal: 0, drumOrdinal: 0 }), c, spliceDrumRanks(model, c));
    expect(o).toEqual({ orderIndex: spliceOrderIndex(0, 3, 'down', c.seed), drumOrderIndex: spliceOrderIndex(0, 2, 'down', c.seed) });
  });

  it('no sequence means no ranking work at all', () => {
    expect(spliceDrumRanks(model, cfg({}))).toBeNull();
  });
});

describe('resolveSplices carries the sequences', () => {
  it('keeps a clean sequence, and treats empty or junk as "use the pattern"', () => {
    const good = resolveSplices(node('splice', 's', { splices: [{ color: '#fff' }], spliceDrumSequence: ['snare', 'kick'], spliceHoopSequence: [2, 1] }), 120)!.config;
    expect(good.drumSequence).toEqual(['snare', 'kick']);
    expect(good.hoopSequence).toEqual([2, 1]);
    const junk = resolveSplices(node('splice', 's', { splices: [{ color: '#fff' }], spliceDrumSequence: [], spliceHoopSequence: [0, -1, 1.5] as number[] }), 120)!.config;
    expect(junk.drumSequence).toBeUndefined();
    expect(junk.hoopSequence).toBeUndefined();
  });
});

/* End to end: the engine fires drums in the dragged order. Kick is drum 0 in the model, so a
   sequence that puts the SNARE first must light the snare while the kick still waits. */
describe('the engine fires in the dragged order', () => {
  function model(): PixelModel {
    return buildPixelModel(
      parseKit({
        global: { ledDensityPxPerM: 30, hoopCount: 2, defaultHoopSpacingMm: 50 },
        drums: [
          { id: 'kick', diameterIn: 12, pixelsPerHoop: 4, hoopSpacingMm: 50, origin: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
          { id: 'snare', diameterIn: 12, pixelsPerHoop: 4, hoopSpacingMm: 50, origin: { x: 600, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        ],
      }),
    );
  }
  const transport = (now: number): TransportState => ({ timeMs: now, beat: 0, bar: 0, beatInBar: 0, bpm: 120, beatsPerBar: 4, playing: true });

  function peaksAt(kind: 'splice' | 'slice', over: Partial<GraphNode>, atMs: number) {
    const m = model();
    const graph: TriggerGraph = {
      version: 3,
      nodes: [node('trigger', 't'), node(kind, 'n', { splices: [{ color: '#ffffff' }], spliceCount: 1, spliceHoldMs: 60000, ...over }), node('output', 'o')],
      edges: [{ id: 'a', from: 't', to: 'n' }, { id: 'b', from: 'n', to: 'o' }],
    };
    const engine = createVoiceBusEngine();
    engine.setModel(m);
    engine.setShow({ buses: [{ id: 'base', name: 'B', polyphony: 'poly', crossfadeMs: 0 }], graphs: { [padKey('kick', '')]: graph }, sections: [], effects: [], presets: [] });
    engine.applyInput({ kind: 'noteOn', drumId: 'kick', zone: '', velocity: 1, timeMs: 0 } as InputEvent);
    for (let t = 5; t <= atMs; t += 5) engine.tick(t, 5, transport(t));
    const f = engine.frame();
    const peak = (id: string) => {
      const d = m.drumById.get(id)!;
      let p = 0;
      for (let i = d.pixelStart; i < d.pixelStart + d.pixelCount; i++) p = Math.max(p, f[i * 4]!, f[i * 4 + 1]!, f[i * 4 + 2]!);
      return p;
    };
    return { kick: peak('kick'), snare: peak('snare') };
  }

  const throughKit = { spliceWaitMode: 'dark' as const, spliceDrumOffsetMode: 'time' as const, spliceDrumOffsetMs: 400, spliceDrumSequence: ['snare', 'kick'] };

  it('Splice: THROUGH KIT lights the snare first when the order says so', () => {
    const early = peaksAt('splice', throughKit, 150);
    expect(early.snare, 'snare first').toBeGreaterThan(0.5);
    expect(early.kick, 'kick waits its turn').toBe(0);
    expect(peaksAt('splice', throughKit, 550).kick, 'kick second').toBeGreaterThan(0.5);
  });

  it('Slice: THROUGH KIT follows the same dragged order', () => {
    const early = peaksAt('slice', throughKit, 150);
    expect(early.snare).toBeGreaterThan(0.5);
    expect(early.kick).toBe(0);
  });

  it('without the sequence, the kick (first in the model) goes first as before', () => {
    const { spliceDrumSequence: _drop, ...pattern } = throughKit;
    const early = peaksAt('splice', pattern, 150);
    expect(early.kick).toBeGreaterThan(0.5);
    expect(early.snare).toBe(0);
  });
});
