/**
 * Hash-based value noise and fBm.
 *
 * Written for this project rather than ported. The upstream Perlin block is
 * copied from p5.js (LGPL-2.1, see NOTICE.md), and beyond the licence question
 * it has two properties this engine cannot live with: a module-global gradient
 * table lazily filled from `Math.random()`, and a fixed octave count.
 *
 * What is here instead is a pure function of (seed, x, y). No state, no
 * initialisation order, and octaves chosen per call — which is what the zoom
 * worlds need, because zooming in must *add* high-frequency octaves that were
 * previously sub-pixel rather than magnify low-frequency ones into blur.
 */

import { hashInts } from './rng';

/** Hash a lattice point to [0, 1). */
function vhash(seed: number, x: number, y: number): number {
  return hashInts(seed, x, y) / 4294967296;
}

/** Hash a 3-D lattice point to [0, 1). */
function vhash3(seed: number, x: number, y: number, z: number): number {
  return hashInts(seed, x, y, z) / 4294967296;
}

/** Ken Perlin's smootherstep: zero 1st and 2nd derivatives at both ends. */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface Noise {
  /** Single-octave value noise in [0, 1). */
  noise2(x: number, y: number): number;
  /**
   * 3-D value noise in [0, 1).
   *
   * Upstream's p5-derived `Noise.noise` takes up to three arguments and the
   * ported generators use all three in fourteen places — usually with the
   * third as a per-instance offset, so two trees at the same coordinates do
   * not come out identical. Folding z into x would make those collide.
   */
  noise3(x: number, y: number, z: number): number;
  /** 1-D convenience slice, for strokes and ridgelines. */
  noise1(x: number, row?: number): number;
  /**
   * Fractal Brownian motion in [0, 1).
   * `octaves` may be fractional: the last octave fades in, so detail appears
   * smoothly as a zoom crosses a level boundary instead of popping.
   */
  fbm(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
  /** Ridged variant — sharp crests, good for mountain spines. */
  ridged(x: number, y: number, octaves?: number): number;
  seed: number;
}

export function makeNoise(seed: number): Noise {
  function noise2(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smootherstep(x - xi);
    const ty = smootherstep(y - yi);

    const v00 = vhash(seed, xi, yi);
    const v10 = vhash(seed, xi + 1, yi);
    const v01 = vhash(seed, xi, yi + 1);
    const v11 = vhash(seed, xi + 1, yi + 1);

    return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
  }

  function noise3(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const tx = smootherstep(x - xi);
    const ty = smootherstep(y - yi);
    const tz = smootherstep(z - zi);

    const c = (dx: number, dy: number, dz: number): number =>
      vhash3(seed, xi + dx, yi + dy, zi + dz);

    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), tx);
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), tx);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), tx);
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), tx);

    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
  }

  function fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let freq = 1;
    const whole = Math.floor(octaves);

    for (let i = 0; i < whole; i++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }

    // Fade in the fractional octave so detail does not pop at level boundaries.
    const frac = octaves - whole;
    if (frac > 0) {
      sum += amp * frac * noise2(x * freq, y * freq);
      norm += amp * frac;
    }

    return norm > 0 ? sum / norm : 0;
  }

  function ridged(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(noise2(x * freq, y * freq) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return norm > 0 ? sum / norm : 0;
  }

  return {
    noise2,
    noise3,
    noise1: (x, row = 0.5) => noise2(x, row),
    fbm,
    ridged,
    seed,
  };
}

/**
 * Wrap a sampled list so its ends meet, then renormalise to [0, 1].
 * Ported from `loopNoise` in shan-shui-inf (MIT, (c) 2018 Lingdong Huang).
 * Used by `blob` to keep closed outlines from showing a seam.
 */
export function loopNoise(list: number[]): void {
  if (list.length === 0) return;
  const dif = list[list.length - 1]! - list[0]!;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < list.length; i++) {
    list[i] = list[i]! + (dif * (list.length - 1 - i)) / (list.length - 1);
    if (list[i]! < lo) lo = list[i]!;
    if (list[i]! > hi) hi = list[i]!;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < list.length; i++) {
    list[i] = (list[i]! - lo) / span;
  }
}
