/**
 * Small numeric helpers.
 *
 * Adapted from the `Util` block of shan-shui-inf by Lingdong Huang
 * (MIT, (c) 2018), vendor/shan-shui-inf/index.html lines 386-443.
 *
 * Modified: the three that consume randomness take an explicit `Rng` instead
 * of reading the global `Math.random` upstream overrides. `randGaussian` is
 * kept as upstream wrote it — rejection sampling against a Gaussian envelope —
 * rather than swapped for `Rng.gauss`, because the two have different spreads
 * and every tuned constant in the ported generators assumes this one.
 */

import type { Rng } from './rng';
import type { Pt } from './types';

export function mapval(
  value: number,
  istart: number,
  istop: number,
  ostart: number,
  ostop: number,
): number {
  return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
}

export function distance(p0: Pt, p1: Pt): number {
  return Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
}

/** Rejection-sample x in [0,1) against the envelope `func`. */
export function wtrand(rng: Rng, func: (x: number) => number): number {
  // Upstream recurses; a loop avoids blowing the stack if an envelope is
  // ever passed that rejects for a long run.
  for (let i = 0; i < 1000; i++) {
    const x = rng();
    const y = rng();
    if (y < func(x)) return x;
  }
  return rng();
}

/** Roughly normal on [-1, 1]. */
export function randGaussian(rng: Rng): number {
  return wtrand(rng, (x) => Math.E ** (-24 * (x - 0.5) ** 2)) * 2 - 1;
}

/**
 * The randomness surface the ported generators expect, bound to one Rng.
 * Named to match upstream so the ported code stays diff-able against it.
 */
export interface Rand {
  /** Upstream's `Math.random()`. */
  (): number;
  choice<T>(arr: readonly T[]): T;
  /** Upstream's `normRand(m, M)`. */
  norm(m: number, M: number): number;
  wt(func: (x: number) => number): number;
  gaussian(): number;
}

export function makeRand(rng: Rng): Rand {
  const r = (() => rng()) as Rand;
  r.choice = (arr) => arr[Math.floor(arr.length * rng())]!;
  r.norm = (m, M) => mapval(rng(), 0, 1, m, M);
  r.wt = (func) => wtrand(rng, func);
  r.gaussian = () => randGaussian(rng);
  return r;
}
