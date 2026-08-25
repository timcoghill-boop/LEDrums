import { clamp01, lerp } from '../../math';
import { hsvToRgb } from '../../color/color';
import { pnum, type EffectGenerator } from '../types';
import { EXP_TAIL_FACTOR, VISIBLE_CUTOFF } from '../visibility';
import { lifeFade } from '../life-fade';
import { hash01, ordered01 } from '../hash';

/**
 * Sparkler: a hit lights the fuse and the drum burns like a firework sparkler — a hot core
 * that fades as the stick spends itself, throwing off individual sparks that snap on white,
 * cool through yellow to orange in a few tens of milliseconds, and die.
 *
 * The crackle is the point, so the sparks are NOT a smooth field: each pixel gets its own
 * random re-ignition times, so they pop out of step with one another. That is done with a
 * hash of (pixel, time bucket) rather than a particle list — every pixel is a potential spark,
 * so tracking them individually would allocate per hit for no visual gain, and a hash gives
 * the same scatter while staying a pure function of the clock.
 *
 * Burn is per DRUM: the struck drum burns, so two hits on different drums burn independently
 * and a roll on one drum keeps it alight.
 */

export const sparkler: EffectGenerator = {
  id: 'sparkler',
  name: 'Sparkler',
  category: 'trigger',
  // The burn fades on exp(-age/burnMs), so it is visible for EXP_TAIL_FACTOR time constants
  // and the voice must be too — `decayMs: 900` reads for ~5s, not 900ms.
  voiceLife: { key: 'decayMs', unit: 'ms', factor: EXP_TAIL_FACTOR },
  paramSpec: [
    // Keyed `decayMs`, not `burnMs`: the inspector groups params by DECLARED key spelling
    // (`param-families.ts`), so an unrecognised spelling would drop out of the Time family. The
    // visible name is still Burn.
    { key: 'decayMs', label: 'Burn', type: 'number', default: 900, min: 100, max: 8000, unit: 'ms' },
    { key: 'density', label: 'Sparks', type: 'number', default: 0.35, min: 0.01, max: 1, step: 0.01 },
    { key: 'sparkMs', label: 'Spark Life', type: 'number', default: 90, min: 10, max: 600, unit: 'ms' },
    { key: 'crackle', label: 'Crackle', type: 'number', default: 0.7, min: 0, max: 1, step: 0.01 },
    { key: 'random', label: 'Random', type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
    { key: 'core', label: 'Core Glow', type: 'number', default: 0.25, min: 0, max: 1, step: 0.01 },
    { key: 'hue', label: 'Hue', type: 'number', default: 42, min: 0, max: 360, unit: '°' },
    { key: 'saturation', label: 'Saturation', type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
    { key: 'brightness', label: 'Brightness', type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  render(ctx, params, fb) {
    const burnMs = Math.max(1, pnum(params, 'decayMs', 900));
    const density = clamp01(pnum(params, 'density', 0.35));
    const sparkMs = Math.max(1, pnum(params, 'sparkMs', 90));
    const crackle = clamp01(pnum(params, 'crackle', 0.7));
    // WHERE the sparks land, as against `crackle`, which is WHEN they fire. At 0 they pick
    // evenly spread pixels and march in an ordered pattern; at 1 they scatter. Blending an
    // ordered sequence with a hash is the standard way to make that a dial rather than a
    // switch — neither end is a special case in the code below.
    const random = clamp01(pnum(params, 'random', 1));
    const core = clamp01(pnum(params, 'core', 0.25));
    const hue = pnum(params, 'hue', 42);
    // Scales the intrinsic hot-core ramp rather than replacing it, so a fresh spark still
    // reads whiter than an old one at any setting — the same shape velocity-flames uses.
    const satParam = clamp01(pnum(params, 'saturation', 1));
    const bri = clamp01(pnum(params, 'brightness', 1));

    // How hard each struck drum is still burning: the strongest decayed hit on it.
    const burnByDrum = new Map<string, number>();
    for (const trig of ctx.triggers) {
      const energy = trig.velocity * lifeFade(ctx, Math.exp(-trig.ageMs / burnMs));
      const prev = burnByDrum.get(trig.drumId) ?? 0;
      if (energy > prev) burnByDrum.set(trig.drumId, energy);
    }
    if (burnByDrum.size === 0) return;

    // Sparks re-ignite once per spark-life window; `bucket` names the window, and the fraction
    // through it drives each spark's own fade. Two adjacent buckets are sampled so a spark that
    // began in the previous window is still dying in this one — without that they would all
    // extinguish together on the bucket boundary and read as a strobe, not a sparkler.
    const nowBucket = Math.floor(ctx.timeMs / sparkMs);
    const phase = ctx.timeMs / sparkMs - nowBucket;

    for (const p of ctx.model.pixels) {
      const burn = burnByDrum.get(p.drumId);
      if (burn === undefined || burn < VISIBLE_CUTOFF) continue;

      let spark = 0;
      for (const back of [0, 1]) {
        const bucket = nowBucket - back;
        // Chance falls with the burn, so the stick throws fewer sparks as it spends itself.
        const pick = lerp(ordered01(p.id, bucket), hash01(p.id, bucket), random);
        if (pick > density * burn) continue;
        // Stagger the ignition inside its window, or every spark in a bucket fires together.
        const offset = crackle * hash01(p.id ^ 0x5bf03635, bucket);
        const age = back + phase - offset;
        if (age < 0 || age >= 1) continue;
        const fade = 1 - age; // linear burn-out reads sharper than an exponential at this length
        if (fade > spark) spark = fade;
      }

      // Ember bed, HALF-WAVED so it has genuine gaps: a sparkler is points of light in the
      // dark, and a bed that lit every pixel would make the sparks read as bright spots on a
      // lit surface instead. The slow bucket (>> 3) lets the gaps drift rather than strobe.
      const ember = hash01(p.id, nowBucket >> 3) * 2 - 1;
      const glow = ember > 0 ? core * burn * ember : 0;
      const level = clamp01(Math.max(spark, glow)) * burn * bri;
      if (level < VISIBLE_CUTOFF) continue;

      // Hot to cool: a fresh spark is near-white, an old one is deep orange. Hue drifts down
      // from the authored value as it cools, so the whole burn warms as it dies.
      const heat = clamp01(spark);
      const sat = lerp(1, 0.15, heat * heat) * satParam;
      const rgb = hsvToRgb(lerp(hue * 0.45, hue, 1 - heat * 0.5), sat, level);
      fb.max(p.id, rgb.r, rgb.g, rgb.b, 1);
    }
  },
};
