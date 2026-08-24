import { describe, expect, it } from 'vitest';
import { parseKit } from '../geometry/kit-schema';
import { buildPixelModel, type PixelModel } from '../geometry/pixel-model';
import { Framebuffer } from '../engine/framebuffer';
import type { RenderContext, TransportState, Trigger } from '../engine/render-context';
import { defaultParams, type EffectGenerator, type ResolvedParams } from './types';
import { sparkler } from './impl/sparkler';
import { flickerEffect } from './impl/flicker-effect';

/* The fire pair. They share a shape — a warm per-drum burn that decays — so what is worth
   pinning is the DIFFERENCE that makes two effects rather than one param: Sparkler scatters
   independent sparks so the surface is broken up at any instant, while Flicker drives the
   whole drum as one body. Plus the things every effect here must hold: only the struck drum
   lights, and the same inputs replay identically. */

function model(drums = 2, hoopCount = 4): PixelModel {
  const drumDefs = Array.from({ length: drums }, (_, i) => ({
    id: `d${i}`,
    diameterIn: 8,
    hoopSpacingMm: 50,
    origin: { x: i * 600, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }));
  return buildPixelModel(
    parseKit({ global: { ledDensityPxPerM: 40, hoopCount, defaultHoopSpacingMm: 50, maxPixelsPerOutput: 100000 }, drums: drumDefs }),
  );
}

const transport = (timeMs = 0): TransportState => ({
  timeMs, beat: 0, bar: 0, beatInBar: 0, bpm: 120, beatsPerBar: 4, playing: true,
});

const hit = (drumId: string, ageMs: number, velocity = 1): Trigger => ({ seq: 1, drumId, note: 38, velocity, timeMs: 0, ageMs });

function ctx(m: PixelModel, timeMs: number, triggers: Trigger[]): RenderContext {
  return { model: m, timeMs, dt: 16, transport: transport(timeMs), triggers };
}

/** Render one frame and return the per-pixel brightness (max channel). */
function frame(gen: EffectGenerator, m: PixelModel, timeMs: number, triggers: Trigger[], over: ResolvedParams = {}): number[] {
  const fb = new Framebuffer(m.pixelCount);
  gen.render(ctx(m, timeMs, triggers), { ...defaultParams(gen.paramSpec), ...over }, fb, undefined);
  return Array.from({ length: m.pixelCount }, (_, i) => Math.max(fb.rgba[i * 4]!, fb.rgba[i * 4 + 1]!, fb.rgba[i * 4 + 2]!));
}

const litCount = (levels: number[]) => levels.filter((v) => v > 0).length;

describe.each([
  ['sparkler', sparkler],
  ['flicker', flickerEffect],
] as const)('%s — what both must hold', (_name, gen) => {
  const m = model();
  const drum = (id: string) => m.drumById.get(id)!;

  it('lights only the struck drum', () => {
    const levels = frame(gen, m, 40, [hit('d0', 20)]);
    const d1 = drum('d1');
    for (let i = d1.pixelStart; i < d1.pixelStart + d1.pixelCount; i++) {
      expect(levels[i], `pixel ${i} on the unstruck drum`).toBe(0);
    }
    expect(litCount(levels), 'and something is lit on the struck one').toBeGreaterThan(0);
  });

  it('renders nothing at all without a hit', () => {
    expect(litCount(frame(gen, m, 40, []))).toBe(0);
  });

  it('replays identically — no ambient randomness', () => {
    const once = frame(gen, m, 137, [hit('d0', 55)]);
    const twice = frame(gen, m, 137, [hit('d0', 55)]);
    expect(once).toEqual(twice);
  });

  it('burns out: a long-stale hit is dimmer than a fresh one', () => {
    const fresh = frame(gen, m, 40, [hit('d0', 10)]);
    const stale = frame(gen, m, 4000, [hit('d0', 3500)]);
    const total = (v: number[]) => v.reduce((a, b) => a + b, 0);
    expect(total(stale)).toBeLessThan(total(fresh));
  });

  it('keeps every channel finite and inside 0..1', () => {
    const fb = new Framebuffer(m.pixelCount);
    gen.render(ctx(m, 90, [hit('d0', 30)]), defaultParams(gen.paramSpec), fb, undefined);
    for (const v of fb.rgba) expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
  });
});

describe('sparkler vs flicker — the difference that makes them two effects', () => {
  const m = model();

  it('sparkler leaves gaps: sparks are scattered, not a solid surface', () => {
    const levels = frame(sparkler, m, 60, [hit('d0', 25)]);
    const d0 = m.drumById.get('d0')!;
    const on: number[] = [];
    const off: number[] = [];
    for (let i = d0.pixelStart; i < d0.pixelStart + d0.pixelCount; i++) {
      (levels[i]! > 0.02 ? on : off).push(i);
    }
    expect(on.length, 'some pixels are alight').toBeGreaterThan(0);
    expect(off.length, 'and some are dark at the same instant — that is the crackle').toBeGreaterThan(0);
  });

  it('flicker drives the whole drum as one body when its spread is closed', () => {
    const levels = frame(flickerEffect, m, 60, [hit('d0', 25)], { spread: 0, depth: 0.6 });
    const d0 = m.drumById.get('d0')!;
    const slice = levels.slice(d0.pixelStart, d0.pixelStart + d0.pixelCount);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    expect(min, 'no pixel of the struck drum is dark').toBeGreaterThan(0);
    expect(max - min, 'and they all sit at the same level').toBeLessThan(0.01);
  });

  it('flicker is unsteady over time — that is the whole effect', () => {
    const levels = [40, 90, 140, 190, 240].map((t) => frame(flickerEffect, m, t, [hit('d0', t - 20)])[m.drumById.get('d0')!.pixelStart]!);
    const spread = Math.max(...levels) - Math.min(...levels);
    expect(spread, 'brightness varies frame to frame').toBeGreaterThan(0.02);
  });

  it('sparkler thins as the stick spends itself', () => {
    // Count actual SPARKS rather than anything alight, so the dim ember bed does not mask the
    // thinning: ignition chance scales with the remaining burn, so late in the burn there are
    // fewer of them.
    const sparks = (timeMs: number, ageMs: number) =>
      frame(sparkler, m, timeMs, [hit('d0', ageMs)]).filter((v) => v > 0.3).length;
    expect(sparks(1500, 1450)).toBeLessThan(sparks(60, 30));
  });
});
