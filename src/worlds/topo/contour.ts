/**
 * Marching squares: contour lines and filled iso-regions.
 *
 * Both operate on a grid sampled on a *global* lattice, which is what makes
 * tiles seam exactly. Neighbouring tiles share their edge samples, so a contour
 * leaving one tile arrives at the identical point in the next — no stitching
 * pass, no visible joins, and tiles stay independently generatable.
 */

import type { Pt } from '../../engine/types';

export interface Grid {
  /** (cols+1) * (rows+1) samples, row-major. */
  v: Float64Array;
  cols: number;
  rows: number;
  /** World coordinate of sample [0,0]. */
  x0: number;
  y0: number;
  /** World units between samples. */
  step: number;
}

export function sampleGrid(
  x0: number,
  y0: number,
  step: number,
  cols: number,
  rows: number,
  f: (x: number, y: number) => number,
): Grid {
  const v = new Float64Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      v[j * (cols + 1) + i] = f(x0 + i * step, y0 + j * step);
    }
  }
  return { v, cols, rows, x0, y0, step };
}

function at(g: Grid, i: number, j: number): number {
  return g.v[j * (g.cols + 1) + i]!;
}

/**
 * The elevation range actually present in this tile.
 *
 * Needed, not merely nice: at a deep zoom the contour interval is tiny while a
 * tile spans a thin slice of elevation, so walking every level from the water
 * line to the summit would run thousands of empty marching-squares passes per
 * tile. Contouring only the range present turns that back into a handful.
 */
export function gridRange(g: Grid): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < g.v.length; i++) {
    const v = g.v[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** Where along an edge the isoline crosses, as a fraction. */
function cross(a: number, b: number, level: number): number {
  const d = b - a;
  return Math.abs(d) < 1e-12 ? 0.5 : (level - a) / d;
}

/**
 * Contour line segments at `level`, joined into polylines.
 * Saddle cells (cases 5 and 10) are disambiguated by the corner average, which
 * is the usual cheap fix and good enough for terrain.
 */
export function contourLines(g: Grid, level: number): Pt[][] {
  const segs: [Pt, Pt][] = [];
  const { step, x0, y0 } = g;

  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const tl = at(g, i, j);
      const tr = at(g, i + 1, j);
      const br = at(g, i + 1, j + 1);
      const bl = at(g, i, j + 1);

      let code = 0;
      if (tl > level) code |= 8;
      if (tr > level) code |= 4;
      if (br > level) code |= 2;
      if (bl > level) code |= 1;
      if (code === 0 || code === 15) continue;

      const cx = x0 + i * step;
      const cy = y0 + j * step;
      const top: Pt = [cx + cross(tl, tr, level) * step, cy];
      const right: Pt = [cx + step, cy + cross(tr, br, level) * step];
      const bottom: Pt = [cx + cross(bl, br, level) * step, cy + step];
      const left: Pt = [cx, cy + cross(tl, bl, level) * step];

      switch (code) {
        case 1:
        case 14:
          segs.push([left, bottom]);
          break;
        case 2:
        case 13:
          segs.push([bottom, right]);
          break;
        case 3:
        case 12:
          segs.push([left, right]);
          break;
        case 4:
        case 11:
          segs.push([top, right]);
          break;
        case 6:
        case 9:
          segs.push([top, bottom]);
          break;
        case 7:
        case 8:
          segs.push([left, top]);
          break;
        case 5: {
          const avg = (tl + tr + br + bl) / 4;
          if (avg > level) {
            segs.push([left, top], [bottom, right]);
          } else {
            segs.push([left, bottom], [top, right]);
          }
          break;
        }
        case 10: {
          const avg = (tl + tr + br + bl) / 4;
          if (avg > level) {
            segs.push([left, bottom], [top, right]);
          } else {
            segs.push([left, top], [bottom, right]);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return joinSegments(segs, g.step * 0.01);
}

/**
 * Chain loose segments into continuous polylines.
 *
 * Worth the ~40 lines: unjoined two-point segments draw fine as crisp lines,
 * but they cannot be fed to the brush `stroke`, which needs a centreline with
 * direction to taper along. Continuous paths keep that door open.
 */
function joinSegments(segs: [Pt, Pt][], eps: number): Pt[][] {
  const quant = (p: Pt): string =>
    `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`;

  const adj = new Map<string, number[]>();
  segs.forEach((s, idx) => {
    for (const p of s) {
      const k = quant(p);
      const list = adj.get(k);
      if (list) list.push(idx);
      else adj.set(k, [idx]);
    }
  });

  const used = new Uint8Array(segs.length);
  const out: Pt[][] = [];

  const step = (chain: Pt[], forward: boolean): void => {
    for (;;) {
      const tip = forward ? chain[chain.length - 1]! : chain[0]!;
      const cands = adj.get(quant(tip));
      if (!cands) return;
      let found = -1;
      let other: Pt | undefined;
      for (const idx of cands) {
        if (used[idx]) continue;
        const s = segs[idx]!;
        if (quant(s[0]) === quant(tip)) {
          found = idx;
          other = s[1];
          break;
        }
        if (quant(s[1]) === quant(tip)) {
          found = idx;
          other = s[0];
          break;
        }
      }
      if (found < 0 || !other) return;
      used[found] = 1;
      if (forward) chain.push(other);
      else chain.unshift(other);
    }
  };

  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const chain: Pt[] = [segs[i]![0], segs[i]![1]];
    step(chain, true);
    step(chain, false);
    if (chain.length > 1) out.push(chain);
  }

  return out;
}

/**
 * Chaikin corner-cutting, to take the facets off a contour.
 *
 * Endpoints are preserved exactly, which is what keeps tiles seamless: two
 * tiles sharing a boundary crossing still agree on its position, even though
 * each smooths its own side independently. The tangent can differ very
 * slightly across a seam; the position cannot.
 */
export function smooth(pts: Pt[], iterations = 1): Pt[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next: Pt[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!;
      const b = cur[i + 1]!;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(cur[cur.length - 1]!);
    cur = next;
  }
  return cur;
}

/**
 * Filled polygons for the region *below* `level`, one per cell.
 *
 * Per-cell rather than globally traced: adjacent cells share interpolated edge
 * points exactly, so the union reads as one smooth shape, while the boundary
 * stays sub-pixel accurate instead of blocky. Simpler and more robust than
 * tracing closed loops, which has to cope with regions that leave the tile.
 */
export function isoFill(g: Grid, level: number): Pt[][] {
  const polys: Pt[][] = [];
  const { step, x0, y0 } = g;

  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const cx = x0 + i * step;
      const cy = y0 + j * step;
      const corners: Pt[] = [
        [cx, cy],
        [cx + step, cy],
        [cx + step, cy + step],
        [cx, cy + step],
      ];
      const vals = [at(g, i, j), at(g, i + 1, j), at(g, i + 1, j + 1), at(g, i, j + 1)];

      if (vals.every((v) => v > level)) continue;
      if (vals.every((v) => v <= level)) {
        polys.push([...corners, corners[0]!]);
        continue;
      }

      const poly: Pt[] = [];
      for (let k = 0; k < 4; k++) {
        const a = vals[k]!;
        const b = vals[(k + 1) % 4]!;
        const pa = corners[k]!;
        const pb = corners[(k + 1) % 4]!;
        if (a <= level) poly.push(pa);
        if (a <= level !== b <= level) {
          const t = cross(a, b, level);
          poly.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]);
        }
      }
      if (poly.length > 2) polys.push([...poly, poly[0]!]);
    }
  }

  return polys;
}
