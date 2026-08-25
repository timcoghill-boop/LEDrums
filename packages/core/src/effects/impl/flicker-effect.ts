import { clamp01, lerp } from '../../math';
import { hsvToRgb } from '../../color/color';
import { pnum, type EffectGenerator } from '../types';
import { EXP_TAIL_FACTOR, VISIBLE_CUTOFF } from '../visibility';
import { lifeFade } from '../life-fade';
import { hash01 } from '../hash';

/**
 * Flicker: the plain sibling of {@link ../impl/sparkler}. A hit lights the struck drum with a
 * warm glow that guts and flares like a flame in a draught, then dies down — no individual
 * sparks, no crackle, just one unsteady light.
 *
 * Where Sparkler samples every pixel independently so they pop out of step, this drives ONE
 * flame per drum from summed sines and lets the whole surface breathe together. That is the
 * whole difference between them, and it is what makes this the one to reach for when a hit
 * should read as a single warm body rather than a shower of sparks.
 *
 * The `depth` param spans both readings: at 0 it is a steady warm wash, at 1 it guts almost to
 * black between flares.
 */
export const flickerEffect: EffectGenerator = {
  id: 'flicker',
  name: 'Flicker',
  category: 'trigger',
  // Fades on exp(-age/decayMs), so it stays visible for EXP_TAIL_FACTOR time constants.
  voiceLife: { key: 'decayMs', unit: 'ms', factor: EXP_TAIL_FACTOR },
  paramSpec: [
    { key: 'decayMs', label: 'Decay', type: 'number', default: 800, min: 100, max: 8000, unit: 'ms' },
    { key: 'rateHz', label: 'Rate', type: 'number', default: 9, min: 0.5, max: 40, step: 0.1, unit: 'Hz' },
    { key: 'depth', label: 'Depth', type: 'number', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'spread', label: 'Spread', type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 },
    { key: 'random', label: 'Random', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'hue', label: 'Hue', type: 'number', default: 32, min: 0, max: 360, unit: '°' },
    { key: 'saturation', label: 'Saturation', type: 'number', default: 0.85, min: 0, max: 1, step: 0.01 },
    { key: 'brightness', label: 'Brightness', type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  render(ctx, params, fb) {
    const decayMs = Math.max(1, pnum(params, 'decayMs', 800));
    const rateHz = Math.max(0.01, pnum(params, 'rateHz', 9));
    const depth = clamp01(pnum(params, 'depth', 0.6));
    const spread = clamp01(pnum(params, 'spread', 0.35));
    // How PREDICTABLE the flame is. At 0 it breathes on the sines alone — regular, almost a
    // pulse. At 1 it jumps between unrelated levels each tick, which is what a draught
    // actually looks like. Anything between is a flame that wanders.
    const random = clamp01(pnum(params, 'random', 0.5));
    const hue = pnum(params, 'hue', 32);
    const sat = clamp01(pnum(params, 'saturation', 0.85));
    const bri = clamp01(pnum(params, 'brightness', 1));

    const energyByDrum = new Map<string, number>();
    for (const trig of ctx.triggers) {
      const energy = trig.velocity * lifeFade(ctx, Math.exp(-trig.ageMs / decayMs));
      const prev = energyByDrum.get(trig.drumId) ?? 0;
      if (energy > prev) energyByDrum.set(trig.drumId, energy);
    }
    if (energyByDrum.size === 0) return;

    const t = ctx.timeMs * 0.001 * rateHz;
    // The tick the erratic term steps on — one per flicker period, so `rateHz` paces both the
    // smooth and the random reading rather than only the smooth one.
    const tick = Math.floor(t);
    // Three sines whose periods share no common multiple, so the flame never visibly repeats.
    // Cheaper and steadier than noise, and at this rate the eye reads it as a guttering flame.
    const flameFor = (seed: number, key: number): number => {
      const a = Math.sin(t * 6.283 + seed);
      const b = Math.sin(t * 4.117 + seed * 2.7 + 1.3);
      const c = Math.sin(t * 9.531 + seed * 0.6 + 2.1);
      const smooth = clamp01(0.5 + (a * 0.5 + b * 0.32 + c * 0.18) * 0.5);
      if (random <= 0) return smooth;
      const erratic = hash01(key, tick);
      return clamp01(lerp(smooth, erratic, random));
    };

    for (const p of ctx.model.pixels) {
      const energy = energyByDrum.get(p.drumId);
      if (energy === undefined || energy < VISIBLE_CUTOFF) continue;

      // `spread` decorrelates the flame across the drum: 0 = the whole drum guts as one body,
      // 1 = each hoop and angle wavers on its own, which is the closest this gets to Sparkler.
      const seed = spread * ((p.hoopIndex - 1) * 1.9 + p.angleDeg * 0.021); // hoopIndex 1-based (A1)
      // Keyed on the group the seed already defines, so `spread` still decides whether the
      // drum guts as one body or hoop by hoop — the random term must not smuggle in per-pixel
      // variation that Spread was set to 0 to avoid.
      const flame = flameFor(seed, Math.round(seed * 1000));
      const level = clamp01(energy * lerp(1, flame, depth)) * bri;
      if (level < VISIBLE_CUTOFF) continue;

      // Brighter moments run whiter, the way a flame's core does when it flares.
      const rgb = hsvToRgb(hue, sat * lerp(1, 0.55, clamp01(flame) * depth), level);
      fb.max(p.id, rgb.r, rgb.g, rgb.b, 1);
    }
  },
};
