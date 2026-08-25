/**
 * Deterministic value noise for effects — the seam the fire pair samples sparks and flames
 * from.
 *
 * A leaf module with no registry import, for the same reason `life-fade` and `visibility` are:
 * anything the impls import must not reach back through the registry that imports them.
 *
 * Why a hash rather than a seeded stream: these are sampled per pixel per frame, and a stream
 * would make each sample depend on how many frames had been drawn before it — the same input
 * would render differently depending on when you started watching. A hash of (pixel, bucket)
 * is a pure function of the clock, so a replay is identical.
 */

/** Deterministic 0..1 from two integers — a 32-bit avalanche mix. */
export function hash01(a: number, b: number): number {
  let h = (Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 0x100000000;
}

/** The golden ratio's fractional part — the classic low-discrepancy step. */
const PHI = 0.6180339887498949;

/**
 * A deterministic 0..1 that is EVENLY spread rather than random: successive inputs land far
 * apart and never clump, which is what "regular" looks like when the alternative is noise.
 *
 * Pairs with {@link hash01}: blending the two is how an effect offers "how random is this",
 * from an ordered pattern at 0 to full scatter at 1, without either end being a special case.
 */
export function ordered01(a: number, b: number): number {
  const v = (a + b * 7) * PHI;
  return v - Math.floor(v);
}
