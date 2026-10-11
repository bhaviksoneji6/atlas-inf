/**
 * Ink-brush drawing primitives.
 *
 * Adapted from shan-shui-inf by Lingdong Huang (MIT, (c) 2018 Lingdong Huang)
 * https://github.com/LingDong-/shan-shui-inf
 * Upstream originals live in vendor/shan-shui-inf/index.html:
 *   poly 485 · stroke 516 · blob 578 · div 627 · texture 653 · bezmh 445
 *
 * Modified: ES5 globals -> module with injected `rng` and `noise` (upstream
 * read a global `Math.random` override and a global `Noise`); SVG string
 * concatenation -> typed `Polyline[]`.
 *
 * The geometry maths is deliberately left alone. The tapered variable-width
 * stroke, the blob shape function and the hatching texture generator are the
 * reason the upstream work looks hand-inked, and they are not worth
 * "improving" by someone who has not spent the time Lingdong did on them.
 */

import { loopNoise, type Noise } from './noise';
import type { Polyline, Pt } from './types';
import type { Rng } from './rng';

export interface PolyArgs {
  xof?: number;
  yof?: number;
  fill?: string;
  stroke?: string;
  width?: number;
  z?: number;
}

export interface StrokeArgs {
  xof?: number;
  yof?: number;
  /** Half-width at the fattest point. */
  wid?: number;
  col?: string;
  /** How much noise modulates the width, 0..1. */
  noi?: number;
  /** Outline width of the resulting filled shape. */
  out?: number;
  /** Width profile along the stroke; defaults to a sine arch. */
  fun?: (x: number) => number;
  z?: number;
}

export interface BlobArgs {
  len?: number;
  wid?: number;
  ang?: number;
  col?: string;
  noi?: number;
  fun?: (x: number) => number;
  z?: number;
}

export interface TextureArgs {
  xof?: number;
  yof?: number;
  /** Number of hatch lines to lay down. */
  tex?: number;
  wid?: number;
  /** Fraction of the span each hatch covers. */
  len?: number;
  /** If non-zero, lay a soft shadow pass underneath. */
  sha?: number;
  noi?: (x: number) => number;
  col?: (x: number) => string;
  /** Where along the span hatches cluster. */
  dis?: () => number;
  z?: number;
}

export interface Brush {
  poly(pts: Pt[], args?: PolyArgs): Polyline;
  stroke(pts: Pt[], args?: StrokeArgs): Polyline;
  blob(x: number, y: number, args?: BlobArgs): Polyline;
  blobPts(x: number, y: number, args?: BlobArgs): Pt[];
  div(pts: Pt[], reso: number): Pt[];
  texture(grid: Pt[][], args?: TextureArgs): Polyline[];
  bezmh(pts: Pt[], w?: number): Pt[];
}

function midPt(a: Pt, b: Pt): Pt {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function makeBrush(rng: Rng, noise: Noise): Brush {
  /** Quadratic-B-spline-ish smoothing through a control polyline. */
  function bezmh(P: Pt[], w = 1): Pt[] {
    if (P.length < 2) return P.slice();
    let ctrl = P;
    if (ctrl.length === 2) {
      ctrl = [ctrl[0]!, midPt(ctrl[0]!, ctrl[1]!), ctrl[1]!];
    }
    const out: Pt[] = [];
    for (let j = 0; j < ctrl.length - 2; j++) {
      const p0 = j === 0 ? ctrl[j]! : midPt(ctrl[j]!, ctrl[j + 1]!);
      const p1 = ctrl[j + 1]!;
      const p2 = j === ctrl.length - 3 ? ctrl[j + 2]! : midPt(ctrl[j + 1]!, ctrl[j + 2]!);
      const pl = 20;
      const extra = j === ctrl.length - 3 ? 1 : 0;
      for (let i = 0; i < pl + extra; i++) {
        const t = i / pl;
        const u = (1 - t) ** 2 + 2 * t * (1 - t) * w + t * t;
        out.push([
          ((1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] * w + t * t * p2[0]) / u,
          ((1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] * w + t * t * p2[1]) / u,
        ]);
      }
    }
    return out;
  }

  function poly(pts: Pt[], args: PolyArgs = {}): Polyline {
    const { xof = 0, yof = 0, fill = 'none', stroke, width = 0, z } = args;
    return {
      pts: pts.map(([x, y]) => [x + xof, y + yof] as Pt),
      fill,
      stroke: stroke ?? fill,
      width,
      z,
    };
  }

  /**
   * A tapered brush stroke: walk the centreline, offset perpendicular by a
   * noise-modulated width on both sides, and close the result into one filled
   * outline. This is the function the whole ink aesthetic rests on.
   */
  function stroke(ptlist: Pt[], args: StrokeArgs = {}): Polyline {
    const {
      xof = 0,
      yof = 0,
      wid = 2,
      col = 'rgba(200,200,200,0.9)',
      noi = 0.5,
      out = 1,
      z,
    } = args;
    const fun = args.fun ?? ((x: number) => Math.sin(x * Math.PI));

    if (ptlist.length < 3) {
      return poly(ptlist, { xof, yof, fill: col, stroke: col, width: out, z });
    }

    const side0: Pt[] = [];
    const side1: Pt[] = [];
    const n0 = rng() * 10;

    for (let i = 1; i < ptlist.length - 1; i++) {
      let w = wid * fun(i / ptlist.length);
      w = w * (1 - noi) + w * noi * noise.noise2(i * 0.5, n0);

      const a1 = Math.atan2(
        ptlist[i]![1] - ptlist[i - 1]![1],
        ptlist[i]![0] - ptlist[i - 1]![0],
      );
      const a2 = Math.atan2(
        ptlist[i]![1] - ptlist[i + 1]![1],
        ptlist[i]![0] - ptlist[i + 1]![0],
      );
      let a = (a1 + a2) / 2;
      if (a < a2) a += Math.PI;

      side0.push([ptlist[i]![0] + w * Math.cos(a), ptlist[i]![1] + w * Math.sin(a)]);
      side1.push([ptlist[i]![0] - w * Math.cos(a), ptlist[i]![1] - w * Math.sin(a)]);
    }

    const outline: Pt[] = [
      ptlist[0]!,
      ...side0,
      ...[...side1, ptlist[ptlist.length - 1]!].reverse(),
      ptlist[0]!,
    ];

    return poly(outline, { xof, yof, fill: col, stroke: col, width: out, z });
  }

  function blobPts(x: number, y: number, args: BlobArgs = {}): Pt[] {
    const { len = 20, wid = 5, ang = 0, noi = 0.5 } = args;
    const fun =
      args.fun ??
      ((p: number) =>
        p <= 1
          ? Math.sin(p * Math.PI) ** 0.5
          : -((Math.sin((p + 1) * Math.PI)) ** 0.5));

    const reso = 20;
    const lalist: Pt[] = [];
    for (let i = 0; i < reso + 1; i++) {
      const p = (i / reso) * 2;
      const xo = len / 2 - Math.abs(p - 1) * len;
      const yo = (fun(p) * wid) / 2;
      lalist.push([Math.sqrt(xo * xo + yo * yo), Math.atan2(yo, xo)]);
    }

    const nslist: number[] = [];
    const n0 = rng() * 10;
    for (let i = 0; i < reso + 1; i++) {
      nslist.push(noise.noise2(i * 0.05, n0));
    }
    loopNoise(nslist);

    return lalist.map((la, i) => {
      const ns = nslist[i]! * noi + (1 - noi);
      return [
        x + Math.cos(la[1] + ang) * la[0] * ns,
        y + Math.sin(la[1] + ang) * la[0] * ns,
      ] as Pt;
    });
  }

  function blob(x: number, y: number, args: BlobArgs = {}): Polyline {
    const col = args.col ?? 'rgba(200,200,200,0.9)';
    return poly(blobPts(x, y, args), { fill: col, stroke: col, width: 0, z: args.z });
  }

  /** Resample a polyline to `reso` sub-steps per segment. */
  function div(plist: Pt[], reso: number): Pt[] {
    if (plist.length === 0) return [];
    const tl = (plist.length - 1) * reso;
    const rlist: Pt[] = [];
    for (let i = 0; i < tl; i++) {
      const lastp = plist[Math.floor(i / reso)]!;
      const nextp = plist[Math.ceil(i / reso)]!;
      const p = (i % reso) / reso;
      rlist.push([lastp[0] * (1 - p) + nextp[0] * p, lastp[1] * (1 - p) + nextp[1] * p]);
    }
    rlist.push(plist[plist.length - 1]!);
    return rlist;
  }

  /**
   * Hatch a quad grid with short strokes — the texture that reads as rock,
   * foliage mass or shading depending on how it is parameterised.
   */
  function texture(ptlist: Pt[][], args: TextureArgs = {}): Polyline[] {
    const {
      xof = 0,
      yof = 0,
      tex = 400,
      wid = 1.5,
      len = 0.2,
      sha = 0,
      z,
    } = args;
    const noiFn = args.noi ?? ((x: number) => 30 / x);
    const colFn = args.col ?? (() => `rgba(100,100,100,${(rng() * 0.3).toFixed(3)})`);
    const disFn =
      args.dis ?? (() => (rng() > 0.5 ? (1 / 3) * rng() : 2 / 3 + (1 / 3) * rng()));

    if (ptlist.length === 0 || !ptlist[0] || ptlist[0].length === 0) return [];
    const reso: [number, number] = [ptlist.length, ptlist[0]!.length];
    const texlist: Pt[][] = [];

    for (let i = 0; i < tex; i++) {
      const mid = (disFn() * reso[1]) | 0;
      const hlen = Math.floor(rng() * (reso[1] * len));
      const start = Math.min(Math.max(mid - hlen, 0), reso[1]);
      const end = Math.min(Math.max(mid + hlen, 0), reso[1]);
      const layer = (i / tex) * (reso[0] - 1);

      const line: Pt[] = [];
      for (let j = start; j < end; j++) {
        const p = layer - Math.floor(layer);
        const lo = ptlist[Math.floor(layer)]!;
        const hi = ptlist[Math.ceil(layer)]!;
        if (!lo[j] || !hi[j]) continue;
        const x = lo[j]![0] * p + hi[j]![0] * (1 - p);
        const y = lo[j]![1] * p + hi[j]![1] * (1 - p);
        const nx = noiFn(layer + 1) * (noise.noise2(x, j * 0.5) - 0.5);
        const ny = noiFn(layer + 1) * (noise.noise2(y, j * 0.5) - 0.5);
        line.push([x + nx, y + ny]);
      }
      texlist.push(line);
    }

    const out: Polyline[] = [];
    if (sha) {
      for (let j = 0; j < texlist.length; j += 1 + (sha !== 0 ? 1 : 0)) {
        out.push(stroke(texlist[j]!, { xof, yof, col: 'rgba(100,100,100,0.1)', wid: sha, z }));
      }
    }
    for (let j = sha; j < texlist.length; j += 1 + sha) {
      out.push(
        stroke(texlist[j]!, { xof, yof, col: colFn(j / texlist.length), wid, z }),
      );
    }
    return out.filter((p) => p.pts.length > 1);
  }

  return { poly, stroke, blob, blobPts, div, texture, bezmh };
}
