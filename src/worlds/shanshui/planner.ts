/**
 * What goes where.
 *
 * Adapted from `mountplanner` in shan-shui-inf by Lingdong Huang
 * (MIT, (c) 2018), vendor/shan-shui-inf/index.html lines 3706-3814.
 *
 * The technique is upstream's: sample a noise field along x, keep its local
 * maxima as mountain sites, reject any site within a minimum distance of one
 * already placed, and record occupancy in a matrix so the later passes — flat
 * mountains, boats — only fill the gaps.
 *
 * One deliberate difference. Upstream's occupancy matrix is a single global
 * that accumulates for as long as the page is open, so what a chunk contains
 * depends on which chunks were generated before it. That is the sequential
 * determinism this engine does not have and does not want: a chunk has to be
 * reproducible from its coordinates alone. So the matrix is rebuilt per chunk
 * over a padded window, which gives each chunk the same local context
 * regardless of how the viewer arrived at it.
 */

import type { Ink } from './ink';

export type FeatureTag = 'mount' | 'flatmount' | 'distmount' | 'boat';

export interface Feature {
  tag: FeatureTag;
  x: number;
  y: number;
  h: number;
}

/**
 * How far either side of a chunk the planner looks. A mountain is up to ~600
 * wide and may be offset by ±500 from its site, so context has to reach well
 * past the chunk edge or features would pop in at the seam.
 */
export const PLAN_PAD = 1200;

export function planChunk(ink: Ink, xmin: number, xmax: number): Feature[] {
  const { rand, nz } = ink;

  const reg: Feature[] = [];
  const samp = 0.03;
  const planmtx = new Map<number, number>();

  const ns = (x: number): number => Math.max(nz(x * samp) - 0.55, 0) * 2;
  const yr = (x: number): number => nz(x * 0.01, Math.PI);

  /** Is (x, y) a local maximum of `f` within radius `r`? */
  function locmax(x: number, y: number, f: (x: number) => number, r: number): boolean {
    const z0 = f(x);
    if (z0 <= 0.3) return false;
    for (let i = x - r; i < x + r; i++) {
      for (let j = y - r; j < y + r; j++) {
        if (f(i) > z0) return false;
      }
    }
    return true;
  }

  function chadd(r: Feature, mind = 10): boolean {
    for (const k of reg) {
      if (Math.abs(k.x - r.x) < mind) return false;
    }
    reg.push(r);
    return true;
  }

  const xstep = 5;
  const mwid = 200;
  const lo = xmin - PLAN_PAD;
  const hi = xmax + PLAN_PAD;

  for (let i = lo; i < hi; i += xstep) {
    planmtx.set(Math.floor(i / xstep), 0);
  }

  for (let i = lo; i < hi; i += xstep) {
    let lastJ = 0;
    for (let j = 0; j < yr(i) * 480; j += 30) {
      lastJ = j;
      if (locmax(i, j, ns, 2)) {
        const xof = i + 2 * (rand() - 0.5) * 500;
        const yof = j + 300;
        if (chadd({ tag: 'mount', x: xof, y: yof, h: ns(i) })) {
          for (let k = Math.floor((xof - mwid) / xstep); k < (xof + mwid) / xstep; k++) {
            planmtx.set(k, (planmtx.get(k) ?? 0) + 1);
          }
        }
      }
    }
    // A distant range roughly every 1000 units.
    if (Math.abs(i) % 1000 < Math.max(1, xstep - 1)) {
      chadd({ tag: 'distmount', x: i, y: 280 - rand() * 50, h: ns(lastJ) });
    }
  }

  // Flat mountains only where nothing else stands.
  for (let i = lo; i < hi; i += xstep) {
    if ((planmtx.get(Math.floor(i / xstep)) ?? 0) !== 0) continue;
    if (rand() < 0.01) {
      for (let j = 0; j < 4 * rand(); j++) {
        chadd({
          tag: 'flatmount',
          x: i + 2 * (rand() - 0.5) * 700,
          y: 700 - j * 50,
          h: ns(i),
        });
      }
    }
  }

  for (let i = lo; i < hi; i += xstep) {
    if (rand() < 0.2) {
      chadd({ tag: 'boat', x: i, y: 300 + rand() * 390, h: 0 }, 400);
    }
  }

  // Each feature belongs to exactly one chunk — the one its site falls in —
  // so a feature straddling a seam is drawn once, not twice.
  return reg.filter((f) => f.x >= xmin && f.x < xmax);
}
