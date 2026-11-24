/**
 * Polygon helpers: centroid and ear-clipping triangulation.
 *
 * Adapted from `PolyTools` in shan-shui-inf by Lingdong Huang (MIT, (c) 2018),
 * vendor/shan-shui-inf/index.html lines 207-382. Only `midPt` and
 * `triangulate` are carried over, because only those two are ever called.
 *
 * `triangulate` is what lets the mountain generator fill an irregular outline
 * with small, roughly-equal cells and then shade each one — the rock texture
 * depends on it. The "best ear" heuristic picks the cut that maximises
 * area-over-perimeter, which avoids slivers that would shade as hairlines.
 */

import type { Pt } from './types';

export function midPt(...pts: Pt[] | [Pt[]]): Pt {
  const plist = (pts.length === 1 && Array.isArray(pts[0][0]) ? pts[0] : pts) as Pt[];
  return plist.reduce(
    (acc: Pt, v: Pt) => [v[0] / plist.length + acc[0], v[1] / plist.length + acc[1]],
    [0, 0] as Pt,
  );
}

export interface TriangulateArgs {
  /** Stop subdividing once a triangle is smaller than this. */
  area?: number;
  /** Skip the containment test when the outline is known to be convex. */
  convex?: boolean;
  optimize?: boolean;
}

type Line = [Pt, Pt];

function lineExpr(pt0: Pt, pt1: Pt): [number, number] {
  const den = pt1[0] - pt0[0];
  const m = den === 0 ? Infinity : (pt1[1] - pt0[1]) / den;
  return [m, pt0[1] - m * pt0[0]];
}

function onSeg(p: Pt, ln: Line): boolean {
  return (
    Math.min(ln[0][0], ln[1][0]) <= p[0] &&
    p[0] <= Math.max(ln[0][0], ln[1][0]) &&
    Math.min(ln[0][1], ln[1][1]) <= p[1] &&
    p[1] <= Math.max(ln[0][1], ln[1][1])
  );
}

function intersect(ln0: Line, ln1: Line): Pt | false {
  const le0 = lineExpr(ln0[0], ln0[1]);
  const le1 = lineExpr(ln1[0], ln1[1]);
  const den = le0[0] - le1[0];
  if (den === 0) return false;
  const x = (le1[1] - le0[1]) / den;
  const y = le0[0] * x + le0[1];
  const p: Pt = [x, y];
  return onSeg(p, ln0) && onSeg(p, ln1) ? p : false;
}

function ptInPoly(pt: Pt, plist: Pt[]): boolean {
  let scount = 0;
  for (let i = 0; i < plist.length; i++) {
    const np = plist[i !== plist.length - 1 ? i + 1 : 0]!;
    if (intersect([plist[i]!, np], [pt, [pt[0] + 999, pt[1] + 999]]) !== false) {
      scount++;
    }
  }
  return scount % 2 === 1;
}

function lnInPoly(ln: Line, plist: Pt[]): boolean {
  const ep = 0.01;
  const lnc: Line = [
    [ln[0][0] * (1 - ep) + ln[1][0] * ep, ln[0][1] * (1 - ep) + ln[1][1] * ep],
    [ln[0][0] * ep + ln[1][0] * (1 - ep), ln[0][1] * ep + ln[1][1] * (1 - ep)],
  ];
  for (let i = 0; i < plist.length; i++) {
    const pt = plist[i]!;
    const np = plist[i !== plist.length - 1 ? i + 1 : 0]!;
    if (intersect(lnc, [pt, np]) !== false) return false;
  }
  return ptInPoly(midPt(ln[0], ln[1]), plist);
}

function sidesOf(plist: Pt[]): number[] {
  const slist: number[] = [];
  for (let i = 0; i < plist.length; i++) {
    const pt = plist[i]!;
    const np = plist[i !== plist.length - 1 ? i + 1 : 0]!;
    slist.push(Math.hypot(np[0] - pt[0], np[1] - pt[1]));
  }
  return slist;
}

function areaOf(plist: Pt[]): number {
  const [a = 0, b = 0, c = 0] = sidesOf(plist);
  const s = (a + b + c) / 2;
  return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
}

/** Area over perimeter — low means a sliver. */
function sliverRatio(plist: Pt[]): number {
  const P = sidesOf(plist).reduce((m, n) => m + n, 0);
  return P === 0 ? 0 : areaOf(plist) / P;
}

export function triangulate(plist: Pt[], args: TriangulateArgs = {}): Pt[][] {
  const { area = 100, convex = false, optimize = true } = args;

  function bestEar(poly: Pt[]): [Pt[], Pt[]] {
    const cuts: [Pt[], Pt[]][] = [];
    for (let i = 0; i < poly.length; i++) {
      const pt = poly[i]!;
      const lp = poly[i !== 0 ? i - 1 : poly.length - 1]!;
      const np = poly[i !== poly.length - 1 ? i + 1 : 0]!;
      const qlist = poly.slice();
      qlist.splice(i, 1);
      if (convex || lnInPoly([lp, np], poly)) {
        const c: [Pt[], Pt[]] = [[lp, pt, np], qlist];
        if (!optimize) return c;
        cuts.push(c);
      }
    }
    let best: [Pt[], Pt[]] = [poly, []];
    let bestRatio = 0;
    for (const cut of cuts) {
      const r = sliverRatio(cut[0]);
      if (r >= bestRatio) {
        best = cut;
        bestRatio = r;
      }
    }
    return best;
  }

  function shatter(poly: Pt[], a: number): Pt[][] {
    if (poly.length === 0) return [];
    if (areaOf(poly) < a) return [poly];

    const slist = sidesOf(poly);
    const ind = slist.reduce((iMax, x, i, arr) => (x > arr[iMax]! ? i : iMax), 0);
    const nind = (ind + 1) % poly.length;
    const lind = (ind + 2) % poly.length;
    const p0 = poly[ind];
    const p1 = poly[nind];
    const p2 = poly[lind];
    if (!p0 || !p1 || !p2) return [];
    const mid = midPt(p0, p1);
    return shatter([p0, mid, p2], a).concat(shatter([p2, p1, mid], a));
  }

  if (plist.length <= 3) return shatter(plist, area);
  const cut = bestEar(plist);
  return shatter(cut[0], area).concat(triangulate(cut[1], args));
}
