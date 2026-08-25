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

/* The Random param. It means the same thing in both — how unpredictable this is — but each
   effect has its own axis for it: WHERE sparks land, and HOW STEADY the flame is. Both ends
   have to be real, so these measure the property rather than just checking the value moved. */
describe('random', () => {
  const m = model();
  const d0 = () => m.drumById.get('d0')!;

  /** Mean absolute gap-to-gap difference between lit pixels — low means evenly spread. */
  function gapVariance(levels: number[]): number {
    const drum = d0();
    const lit: number[] = [];
    for (let i = drum.pixelStart; i < drum.pixelStart + drum.pixelCount; i++) if (levels[i]! > 0.3) lit.push(i);
    if (lit.length < 3) return 0;
    const gaps = lit.slice(1).map((v, i) => v - lit[i]!);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    return gaps.reduce((a, g) => a + Math.abs(g - mean), 0) / gaps.length;
  }

  it('sparkler: at 0 the sparks are evenly spread, at 1 they scatter', () => {
    const ordered = gapVariance(frame(sparkler, m, 60, [hit('d0', 25)], { random: 0, crackle: 0 }));
    const scattered = gapVariance(frame(sparkler, m, 60, [hit('d0', 25)], { random: 1, crackle: 0 }));
    expect(ordered, 'an ordered pattern has near-uniform gaps').toBeLessThan(scattered);
  });

  it('sparkler: both ends still light sparks — neither is a dead setting', () => {
    for (const random of [0, 0.5, 1]) {
      const levels = frame(sparkler, m, 60, [hit('d0', 25)], { random });
      expect(levels.filter((v) => v > 0.3).length, `random ${random}`).toBeGreaterThan(0);
    }
  });

  /** The largest single-frame jump in brightness over a second, sampled finely (5ms). A sine
      cannot jump: its per-frame move is bounded by its slope, so a smooth flame stays small
      however fast it breathes. A stepped value can jump its whole range in one frame. That
      gap is what "erratic" actually means here, and sampling coarsely would hide it. */
  function biggestJump(random: number): number {
    const px = d0().pixelStart;
    let prev = 0;
    let worst = 0;
    for (let t = 0; t <= 1000; t += 5) {
      const v = frame(flickerEffect, m, t, [hit('d0', 0)], { random, spread: 0, depth: 1, decayMs: 100000 })[px]!;
      if (t > 0) worst = Math.max(worst, Math.abs(v - prev));
      prev = v;
    }
    return worst;
  }

  it('flicker: at 0 the flame breathes smoothly, at 1 it jumps', () => {
    expect(biggestJump(0) * 2, 'a sine cannot jump — it is bounded by its slope').toBeLessThan(biggestJump(1));
  });

  it('flicker: random does not smuggle in per-pixel variation that Spread was closed to avoid', () => {
    const levels = frame(flickerEffect, m, 60, [hit('d0', 25)], { random: 1, spread: 0, depth: 0.6 });
    const drum = d0();
    const slice = levels.slice(drum.pixelStart, drum.pixelStart + drum.pixelCount);
    expect(Math.max(...slice) - Math.min(...slice), 'still one body').toBeLessThan(0.01);
  });

  it('both replay identically at any setting', () => {
    for (const gen of [sparkler, flickerEffect]) {
      for (const random of [0, 0.5, 1]) {
        const a = frame(gen, m, 137, [hit('d0', 55)], { random });
        const b = frame(gen, m, 137, [hit('d0', 55)], { random });
        expect(a, `${gen.id} at ${random}`).toEqual(b);
      }
    }
  });
});
