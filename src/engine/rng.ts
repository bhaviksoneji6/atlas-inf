/**
 * Coordinate-seeded randomness.
 *
 * The upstream shan-shui-inf replaces the global `Math.random` with a single
 * sequential stream, which makes its worlds reproducible only if you traverse
 * them in the same order. Scroll right then left and you get different trees
 * than left then right. That is invisible while scrolling along one axis, and
 * fatal as soon as a world can be zoomed or linked to.
 *
 * So: no streams, no globals. Every feature derives its randomness from its own
 * coordinates, which means any tile at any zoom can be generated in isolation
 * and a pasted URL reconstructs exactly the view it describes.
 */

/** FNV-1a over a string, used to turn a human seed into a numeric one. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mix an arbitrary number of integers into one well-distributed 32-bit value.
 * Based on the integer-hash finalisers in the MurmurHash family: cheap, and
 * crucially order-sensitive, so hash(seed, 3, 7) !== hash(seed, 7, 3).
 */
export function hashInts(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    let k = Math.imul(p | 0, 0x85ebca6b) >>> 0;
    k = ((k << 13) | (k >>> 19)) >>> 0;
    h = (h ^ k) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
  }
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x2545f491) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  (): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform element of `arr`. */
  pick<T>(arr: readonly T[]): T;
  /** Approximately standard-normal, via the sum-of-uniforms trick. */
  gauss(): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /**
   * A fresh independent generator, labelled. Use this to give a sub-feature its
   * own stream without consuming draws from the parent, so adding a detail pass
   * later cannot shift everything generated after it.
   */
  fork(...label: number[]): Rng;
}

/** Mulberry32: small, fast, and good enough for art. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build an `Rng` from a numeric seed. */
export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng = (() => next()) as Rng;

  rng.range = (min, max) => min + next() * (max - min);
  rng.int = (n) => Math.floor(next() * n);
  rng.pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!;
  rng.chance = (p) => next() < p;
  rng.gauss = () => (next() + next() + next() + next() + next() + next() - 3) / 1.5;
  rng.fork = (...label) => makeRng(hashInts(seed, ...label));

  return rng;
}

/**
 * The RNG for a point in a world: deterministic in (seed, x, y, level).
 * Coordinates are rounded, so callers should pass feature-anchor positions
 * rather than continuously varying ones.
 */
export function rngAt(seed: number, x: number, y: number, level = 0): Rng {
  return makeRng(hashInts(seed, Math.round(x), Math.round(y), level));
}
