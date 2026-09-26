import { describe, expect, it } from 'vitest';
import { parseKit } from '../geometry/kit-schema';
import { buildPixelModel, type PixelModel } from '../geometry/pixel-model';
import type { TransportState } from '../engine/render-context';
import { createVoiceBusEngine, type InputEvent } from './engine';
import { padKey, type Bus, type GraphNode, type Show, type SpliceDef, type TriggerGraph } from './types';

/* Slice end to end: a hit fires a slice node and the real engine (eval → voice pool →
   compositor) draws it. The pure tests pin the geometry; these pin the JOINS — that a slice
   is picked up by eval at all, spawns a lit voice, reaches the compositor's 3D branch, and
   keeps the parts it borrows from the splice working (colour fill, velocity, scope, the voice
   outliving its cascade). Each is a place a new node kind silently falls through. */

/** Kick at x=0, snare 600mm to its right — two 8-pixel hoops each, 32 pixels in all. */
function testModel(): PixelModel {
  return buildPixelModel(
    parseKit({
      global: { ledDensityPxPerM: 30, hoopCount: 2, defaultHoopSpacingMm: 50 },
      drums: [
        { id: 'kick', diameterIn: 12, pixelsPerHoop: 8, hoopSpacingMm: 50, origin: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        { id: 'snare', diameterIn: 12, pixelsPerHoop: 8, hoopSpacingMm: 50, origin: { x: 600, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      ],
    }),
  );
}

const buses = (): Bus[] => [{ id: 'base', name: 'Base', polyphony: 'poly', crossfadeMs: 200 }];

function node(kind: GraphNode['kind'], id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id, kind, x: 0, y: 0, mode: 'oneshot', scope: 'kit', effectId: '', presetId: '', busId: '', params: {}, env: {},
    noRepeat: true, on: 'value', valueMode: 'gate', threshold: 0.5, invert: false, bands: [0.5], p: 0.5,
    delayMode: 'time', ms: 0, division: '1/8', ...over,
  };
}

function sliceGraph(splices: SpliceDef[], over: Partial<GraphNode> = {}): TriggerGraph {
  return {
    version: 3,
    nodes: [
      node('trigger', 'trigger'),
      node('slice', 'sl1', { splices, spliceCount: splices.length, spliceHoldMs: 60000, ...over }),
      node('output', 'output'),
    ],
    edges: [
      { id: 'e0', from: 'trigger', to: 'sl1' },
      { id: 'e1', from: 'sl1', to: 'output' },
    ],
  };
}

const show = (graph: TriggerGraph): Show => ({ buses: buses(), graphs: { [padKey('kick', '')]: graph }, sections: [], effects: [], presets: [] });

const transport = (now: number): TransportState => ({ timeMs: now, beat: 0, bar: 0, beatInBar: 0, bpm: 120, beatsPerBar: 4, playing: true });

/** Fire the graph with `velocity`, run to `atMs` in small steps, and return per-drum peaks. */
function render(graph: TriggerGraph, atMs = 60, velocity = 1) {
  const model = testModel();
  const engine = createVoiceBusEngine();
  engine.setModel(model);
  engine.setShow(show(graph));
  engine.applyInput({ kind: 'noteOn', drumId: 'kick', zone: '', velocity, timeMs: 0 } as InputEvent);
  for (let t = 5; t <= atMs; t += 5) engine.tick(t, 5, transport(t));
  const frame = engine.frame();
  const rgb = (i: number): [number, number, number] => [frame[i * 4]!, frame[i * 4 + 1]!, frame[i * 4 + 2]!];
  const peak = (drumId: string): number => {
    const d = model.drumById.get(drumId)!;
    let p = 0;
    for (let i = d.pixelStart; i < d.pixelStart + d.pixelCount; i++) p = Math.max(p, ...rgb(i));
    return p;
  };
  return { model, rgb, peak, voices: engine.stats().voices.length };
}

describe('slice — through the real engine', () => {
  it('cuts the kit into slabs along X: the left drum takes one colour, the right the other', () => {
    const { model, rgb } = render(sliceGraph([{ color: '#ff0000' }, { color: '#0000ff' }]));
    const kick = model.drumById.get('kick')!;
    const snare = model.drumById.get('snare')!;
    const [kr, , kb] = rgb(kick.pixelStart);
    const [sr, , sb] = rgb(snare.pixelStart);
    expect(kr, 'kick is red').toBeGreaterThan(0.5);
    expect(kb, 'kick is not blue').toBeCloseTo(0, 2);
    expect(sb, 'snare is blue').toBeGreaterThan(0.5);
    expect(sr, 'snare is not red').toBeCloseTo(0, 2);
  });

  it('spawns nothing when every slice is blank', () => {
    expect(render(sliceGraph([{}, { muted: true }])).voices).toBe(0);
  });

  it('is velocity sensitive by default — a soft hit is a dimmer slice', () => {
    const hard = render(sliceGraph([{ color: '#ffffff' }]), 60, 1).peak('kick');
    const soft = render(sliceGraph([{ color: '#ffffff' }]), 60, 0.25).peak('kick');
    expect(soft).toBeLessThan(hard * 0.5);
  });

  it('ignores velocity when its sensitivity is off', () => {
    const hard = render(sliceGraph([{ color: '#ffffff' }], { sliceVelocity: 0 }), 60, 1).peak('kick');
    const soft = render(sliceGraph([{ color: '#ffffff' }], { sliceVelocity: 0 }), 60, 0.25).peak('kick');
    expect(soft).toBeCloseTo(hard, 3);
  });

  it('a SPACE slice lights only the pixels inside its box', () => {
    // A box round the kick alone.
    const r = render(sliceGraph([{ color: '#ffffff' }], { sliceRegion: { cx: 0, cy: 0, cz: 0, sx: 400, sy: 400, sz: 400 } }));
    expect(r.peak('kick')).toBeGreaterThan(0.5);
    expect(r.peak('snare')).toBe(0);
  });

  it('a DRUM slice lights only its drum', () => {
    const r = render(sliceGraph([{ color: '#ffffff' }], { scope: 'drum', targetId: 'snare' }));
    expect(r.peak('snare')).toBeGreaterThan(0.5);
    expect(r.peak('kick')).toBe(0);
  });

  it('outlives a long DRUM CHASE, so the far drum lights when its turn comes', () => {
    // A short authored envelope (10 + 200 + 100ms) against a 1500ms drum delay: without the
    // engine extending the voice by the cascade, the snare's turn would come after it died.
    const graph = sliceGraph([{ color: '#ffffff' }], {
      spliceWaitMode: 'dark',
      spliceDrumOffsetMode: 'time',
      spliceDrumOffsetMs: 1500,
      spliceAttackMs: 10,
      spliceHoldMs: 200,
      spliceReleaseMs: 100,
    });
    const early = render(graph, 400);
    expect(early.peak('kick'), 'kick first').toBeGreaterThan(0.5);
    expect(early.peak('snare'), 'snare still waiting').toBe(0);
    expect(render(graph, 1600).peak('snare'), 'snare on its turn').toBeGreaterThan(0.5);
  });
});
