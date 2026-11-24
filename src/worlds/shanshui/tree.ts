/**
 * Trees.
 *
 * Adapted from the `Tree` module of shan-shui-inf by Lingdong Huang
 * (MIT, (c) 2018), vendor/shan-shui-inf/index.html lines 743-1725.
 *
 * Modified: ES5 closures over globals -> functions taking an `Ink` context;
 * concatenated SVG strings -> `Polyline[]`. The geometry and every tuned
 * constant are upstream's. Draw order is preserved by push order, which the
 * renderers honour because their z-sort is stable and nothing here sets z.
 *
 * The eight are not variations on a theme — tree01/02/03 are drawn from blobs
 * and lines directly, 04/05/06 are grown from the shared `branch`/`twig`/
 * `barkify` trio, 07 is triangulated and shaded, 08 is a fractal twig.
 */

import { distance } from '../../engine/math';
import { midPt, triangulate } from '../../engine/poly-tools';
import type { Pt } from '../../engine/types';
import { parseRgba, rgba, type Ink, type Out } from './ink';

export interface Tree01Args { hei?: number; wid?: number; col?: string }
export interface Tree02Args { hei?: number; wid?: number; clu?: number; col?: string }
export interface Tree03Args { hei?: number; wid?: number; ben?: (x: number) => number; col?: string }
export interface Tree0456Args { hei?: number; wid?: number; col?: string }
export interface Tree07Args { hei?: number; wid?: number; ben?: (x: number) => number; col?: string }
export interface Tree08Args { hei?: number; wid?: number; col?: string }

export function makeTree(ink: Ink) {
  const { rand, brush, nz } = ink;

  /** A tapered, kinked limb: returns its two edges. */
  function branch(
    args: { hei?: number; wid?: number; ang?: number; det?: number; ben?: number } = {},
  ): [Pt[], Pt[]] {
    const { hei = 300, wid = 6, ang = 0, det = 10, ben = Math.PI * 0.2 } = args;

    let nx = 0;
    let ny = 0;
    const tlist: Pt[] = [[nx, ny]];
    let a0 = 0;
    const g = 3;
    for (let i = 0; i < g; i++) {
      a0 += (ben / 2 + (rand() * ben) / 2) * rand.choice([-1, 1]);
      nx += (Math.cos(a0) * hei) / g;
      ny -= (Math.sin(a0) * hei) / g;
      tlist.push([nx, ny]);
    }

    // Rotate the whole limb so its tip points along `ang`.
    const last = tlist[tlist.length - 1]!;
    const ta = Math.atan2(last[1], last[0]);
    for (const p of tlist) {
      const a = Math.atan2(p[1], p[0]);
      const d = Math.hypot(p[0], p[1]);
      p[0] = d * Math.cos(a - ta + ang);
      p[1] = d * Math.sin(a - ta + ang);
    }

    const trlist1: Pt[] = [];
    const trlist2: Pt[] = [];
    const span = det;
    const tl = (tlist.length - 1) * span;
    let lx = 0;
    let ly = 0;

    for (let i = 0; i < tl; i++) {
      const lastp = tlist[Math.floor(i / span)]!;
      const nextp = tlist[Math.ceil(i / span)]!;
      const p = (i % span) / span;
      const px = lastp[0] * (1 - p) + nextp[0] * p;
      const py = lastp[1] * (1 - p) + nextp[1] * p;

      const a = Math.atan2(py - ly, px - lx);
      const woff = ((nz(i * 0.3) - 0.5) * wid * hei) / 80;
      const b = p === 0 ? rand() * wid : 0;
      const nw = wid * (((tl - i) / tl) * 0.5 + 0.5);

      trlist1.push([
        px + Math.cos(a + Math.PI / 2) * (nw + woff + b),
        py + Math.sin(a + Math.PI / 2) * (nw + woff + b),
      ]);
      trlist2.push([
        px + Math.cos(a - Math.PI / 2) * (nw - woff + b),
        py + Math.sin(a - Math.PI / 2) * (nw - woff + b),
      ]);
      lx = px;
      ly = py;
    }

    return [trlist1, trlist2];
  }

  /** A recursive sprig, optionally ending in leaves. */
  function twig(
    tx: number,
    ty: number,
    dep: number,
    args: { dir?: number; sca?: number; wid?: number; ang?: number; lea?: [boolean, number] } = {},
  ): Out {
    const { dir = 1, sca = 1, wid = 1, ang = 0, lea = [true, 12] as [boolean, number] } = args;

    const out: Out = [];
    const twlist: Pt[] = [];
    const tl = 10;
    const hs = rand() * 0.5 + 0.5;
    // Upstream defines two profile functions and then only ever picks the
    // second; `fun1` is dead there and omitted here.
    const tfun = (x: number): number => -1 / (x + 1) ** 5 + 1;
    const a0 = ((rand() * Math.PI) / 6) * dir + ang;

    for (let i = 0; i < tl; i++) {
      const mx = dir * tfun(i / tl) * 50 * sca * hs;
      const my = -i * 5 * sca;
      const a = Math.atan2(my, mx);
      const d = Math.hypot(mx, my);
      const nx = Math.cos(a + a0) * d;
      const ny = Math.sin(a + a0) * d;

      twlist.push([nx + tx, ny + ty]);

      if ((i === ((tl / 3) | 0) || i === (((tl * 2) / 3) | 0)) && dep > 0) {
        out.push(
          ...twig(nx + tx, ny + ty, dep - 1, {
            ang, sca: sca * 0.8, wid, dir: dir * rand.choice([-1, 1]), lea,
          }),
        );
      }

      if (i === tl - 1 && lea[0]) {
        for (let j = 0; j < 5; j++) {
          const dj = (j - 2.5) * 5;
          out.push(
            brush.blob(
              nx + tx + Math.cos(ang) * dj * wid,
              ny + ty + (Math.sin(ang) * dj - lea[1] / (dep + 1)) * wid,
              {
                wid: (6 + 3 * rand()) * wid,
                len: (15 + 12 * rand()) * wid,
                ang: ang / 2 + Math.PI / 2 + Math.PI * 0.2 * (rand() - 0.5),
                col: `rgba(100,100,100,${(0.5 + dep * 0.2).toFixed(3)})`,
                fun: (x) =>
                  x <= 1
                    ? (Math.sin(x * Math.PI) * x) ** 0.5
                    : -((Math.sin((x - 2) * Math.PI * (x - 2))) ** 0.5),
              },
            ),
          );
        }
      }
    }

    out.push(
      brush.stroke(twlist, {
        wid: 1,
        fun: (x) => Math.cos((x * Math.PI) / 2),
        col: 'rgba(100,100,100,0.5)',
      }),
    );
    return out;
  }

  /** Texture a limb: ridges, knots and flaking bark. */
  function barkify(x: number, y: number, trlist: [Pt[], Pt[]]): Out {
    const out: Out = [];

    function bark(bx: number, by: number, wid: number, ang: number): Out {
      const len = 10 + 10 * rand();
      const noi = 0.5;
      const fun = (p: number): number =>
        p <= 1 ? Math.sin(p * Math.PI) ** 0.5 : -((Math.sin((p + 1) * Math.PI)) ** 0.5);

      const reso = 20;
      const lalist: Pt[] = [];
      for (let i = 0; i < reso + 1; i++) {
        const p = (i / reso) * 2;
        const xo = len / 2 - Math.abs(p - 1) * len;
        const yo = (fun(p) * wid) / 2;
        lalist.push([Math.hypot(xo, yo), Math.atan2(yo, xo)]);
      }
      const nslist: number[] = [];
      const n0 = rand() * 10;
      for (let i = 0; i < reso + 1; i++) nslist.push(nz(i * 0.05, n0));
      loopNorm(nslist);

      const brklist: Pt[] = lalist.map((la, i) => {
        const ns = nslist[i]! * noi + (1 - noi);
        return [bx + Math.cos(la[1] + ang) * la[0] * ns, by + Math.sin(la[1] + ang) * la[0] * ns];
      });

      const fr = rand();
      return [
        brush.stroke(brklist, {
          wid: 0.8,
          noi: 0,
          col: 'rgba(100,100,100,0.4)',
          out: 0,
          fun: (p) => Math.sin((p + fr) * Math.PI * 3),
        }),
      ];
    }

    for (let i = 2; i < trlist[0].length - 1; i++) {
      const a0 = Math.atan2(
        trlist[0][i]![1] - trlist[0][i - 1]![1],
        trlist[0][i]![0] - trlist[0][i - 1]![0],
      );
      const a1 = Math.atan2(
        trlist[1][i]![1] - trlist[1][i - 1]![1],
        trlist[1][i]![0] - trlist[1][i - 1]![0],
      );
      const p = rand();
      const nx = trlist[0][i]![0] * (1 - p) + trlist[1][i]![0] * p;
      const ny = trlist[0][i]![1] * (1 - p) + trlist[1][i]![1] * p;

      if (rand() < 0.2) {
        out.push(
          brush.blob(nx + x, ny + y, {
            noi: 1,
            len: 15,
            wid: 6 - Math.abs(p - 0.5) * 10,
            ang: (a0 + a1) / 2,
            col: 'rgba(100,100,100,0.6)',
          }),
        );
      } else {
        out.push(...bark(nx + x, ny + y, 5 - Math.abs(p - 0.5) * 10, (a0 + a1) / 2));
      }

      if (rand() < 0.05) {
        const jl = rand() * 2 + 2;
        const xya = rand.choice<[number, number, number]>([
          [trlist[0][i]![0], trlist[0][i]![1], a0],
          [trlist[1][i]![0], trlist[1][i]![1], a1],
        ]);
        for (let j = 0; j < jl; j++) {
          out.push(
            brush.blob(
              xya[0] + x + Math.cos(xya[2]) * (j - jl / 2) * 4,
              xya[1] + y + Math.sin(xya[2]) * (j - jl / 2) * 4,
              { wid: 4, len: 4 + 6 * rand(), ang: a0 + Math.PI / 2, col: 'rgba(100,100,100,0.6)' },
            ),
          );
        }
      }
    }

    // Broken-up outline fragments, drifted off the limb — the flaking bark.
    const trflist = trlist[0].concat(trlist[1].slice().reverse());
    const rglist: Pt[][] = [[]];
    for (const pt of trflist) {
      if (rand() < 0.5) rglist.push([]);
      else rglist[rglist.length - 1]!.push(pt);
    }

    for (let i = 0; i < rglist.length; i++) {
      const seg = brush.div(rglist[i]!, 4);
      for (let j = 0; j < seg.length; j++) {
        seg[j]![0] += (nz(i, j * 0.1, 1) - 0.5) * (15 + 5 * rand.gaussian());
        seg[j]![1] += (nz(i, j * 0.1, 2) - 0.5) * (15 + 5 * rand.gaussian());
      }
      if (seg.length < 2) continue;
      out.push(
        brush.stroke(
          seg.map((v) => [v[0] + x, v[1] + y] as Pt),
          { wid: 1.5, col: 'rgba(100,100,100,0.7)', out: 0 },
        ),
      );
    }
    return out;
  }

  /** Upstream's `loopNoise`, inlined here to avoid a circular import. */
  function loopNorm(list: number[]): void {
    if (list.length === 0) return;
    const dif = list[list.length - 1]! - list[0]!;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < list.length; i++) {
      list[i] = list[i]! + (dif * (list.length - 1 - i)) / (list.length - 1);
      lo = Math.min(lo, list[i]!);
      hi = Math.max(hi, list[i]!);
    }
    const span = hi - lo || 1;
    for (let i = 0; i < list.length; i++) list[i] = (list[i]! - lo) / span;
  }

  /** The shared trunk-and-outline finish used by trees 04, 05, 06 and 08. */
  function trunkFinish(trmlist: Pt[], x: number, y: number, col: string, alpha: number): Out {
    const out: Out = [];
    out.push(brush.poly(trmlist, { xof: x, yof: y, fill: 'white', stroke: col, width: 0 }));
    const inner = trmlist.slice(1, trmlist.length - 1);
    if (inner.length > 1) {
      out.push(
        brush.stroke(
          inner.map((v) => [v[0] + x, v[1] + y] as Pt),
          {
            col: `rgba(100,100,100,${(alpha + rand() * 0.1).toFixed(3)})`,
            wid: 2.5,
            fun: () => Math.sin(1),
            noi: 0.9,
            out: 0,
          },
        ),
      );
    }
    return out;
  }

  // -------------------------------------------------------------------------

  /** Thin trunk with a haze of leaf blobs — the mid-slope filler. */
  function tree01(x: number, y: number, args: Tree01Args = {}): Out {
    const { hei = 50, wid = 3, col = 'rgba(100,100,100,0.5)' } = args;
    const reso = 10;
    const nslist: Pt[] = [];
    for (let i = 0; i < reso; i++) nslist.push([nz(i * 0.5), nz(i * 0.5, 0.5)]);

    const leafcol = parseRgba(col);
    const out: Out = [];
    const line1: Pt[] = [];
    const line2: Pt[] = [];

    for (let i = 0; i < reso; i++) {
      const nx = x;
      const ny = y - (i * hei) / reso;
      if (i >= reso / 4) {
        for (let j = 0; j < (reso - i) / 5; j++) {
          out.push(
            brush.blob(nx + (rand() - 0.5) * wid * 1.2 * (reso - i), ny + (rand() - 0.5) * wid, {
              len: rand() * 20 * (reso - i) * 0.2 + 10,
              wid: rand() * 6 + 3,
              ang: ((rand() - 0.5) * Math.PI) / 6,
              col: rgba(leafcol, (rand() * 0.2 + parseFloat(leafcol[3]!)).toFixed(1)),
            }),
          );
        }
      }
      line1.push([nx + (nslist[i]![0] - 0.5) * wid - wid / 2, ny]);
      line2.push([nx + (nslist[i]![1] - 0.5) * wid + wid / 2, ny]);
    }

    out.push(brush.poly(line1, { fill: 'none', stroke: col, width: 1.5 }));
    out.push(brush.poly(line2, { fill: 'none', stroke: col, width: 1.5 }));
    return out;
  }

  /** A cluster of leaf blobs with no trunk — scrub, and mountain-rim fuzz. */
  function tree02(x: number, y: number, args: Tree02Args = {}): Out {
    const { hei = 16, wid = 8, clu = 5, col = 'rgba(100,100,100,0.5)' } = args;
    const out: Out = [];
    for (let i = 0; i < clu; i++) {
      out.push(
        brush.blob(x + rand.gaussian() * clu * 4, y + rand.gaussian() * clu * 4, {
          ang: Math.PI / 2,
          fun: (p) =>
            p <= 1
              ? (Math.sin(p * Math.PI) * p) ** 0.5
              : -((Math.sin((p - 2) * Math.PI * (p - 2))) ** 0.5),
          wid: rand() * wid * 0.75 + wid * 0.5,
          len: rand() * hei * 0.75 + hei * 0.5,
          col,
        }),
      );
    }
    return out;
  }

  /** Bending trunk, leaves massed along it — the foreground shore tree. */
  function tree03(x: number, y: number, args: Tree03Args = {}): Out {
    const { hei = 50, wid = 5, ben = () => 0, col = 'rgba(100,100,100,0.5)' } = args;
    const reso = 10;
    const nslist: Pt[] = [];
    for (let i = 0; i < reso; i++) nslist.push([nz(i * 0.5), nz(i * 0.5, 0.5)]);

    const leafcol = parseRgba(col);
    const blobs: Out = [];
    const line1: Pt[] = [];
    const line2: Pt[] = [];

    for (let i = 0; i < reso; i++) {
      const nx = x + ben(i / reso) * 100;
      const ny = y - (i * hei) / reso;
      if (i >= reso / 5) {
        for (let j = 0; j < (reso - i) * 2; j++) {
          const shape = (p: number): number => Math.log(50 * p + 1) / 3.95;
          const ox = rand() * wid * 2 * shape((reso - i) / reso);
          blobs.push(
            brush.blob(nx + ox * rand.choice([-1, 1]), ny + (rand() - 0.5) * wid * 2, {
              len: ox * 2,
              wid: rand() * 6 + 3,
              ang: ((rand() - 0.5) * Math.PI) / 6,
              col: rgba(leafcol, (rand() * 0.2 + parseFloat(leafcol[3]!)).toFixed(3)),
            }),
          );
        }
      }
      line1.push([nx + (((nslist[i]![0] - 0.5) * wid - wid / 2) * (reso - i)) / reso, ny]);
      line2.push([nx + (((nslist[i]![1] - 0.5) * wid + wid / 2) * (reso - i)) / reso, ny]);
    }

    const lc = line1.concat(line2.reverse());
    return [brush.poly(lc, { fill: 'white', stroke: col, width: 1.5 }), ...blobs];
  }

  /** Big branching tree with bark and leafy twigs. */
  function tree04(x: number, y: number, args: Tree0456Args = {}): Out {
    const { hei = 300, wid = 6, col = 'rgba(100,100,100,0.5)' } = args;
    const out: Out = [];
    const txcanv: Out = [];
    const twcanv: Out = [];

    const branches = branch({ hei, wid, ang: -Math.PI / 2 });
    txcanv.push(...barkify(x, y, branches));
    const trlist = branches[0].concat(branches[1].reverse());

    let trmlist: Pt[] = [];
    for (let i = 0; i < trlist.length; i++) {
      if (
        (i >= trlist.length * 0.3 && i <= trlist.length * 0.7 && rand() < 0.1) ||
        i === trlist.length / 2 - 1
      ) {
        const ba = Math.PI * 0.2 - Math.PI * 1.4 * (i > trlist.length / 2 ? 1 : 0);
        const brlist = branch({ hei: hei * (rand() + 1) * 0.3, wid: wid * 0.5, ang: ba });
        brlist[0].splice(0, 1);
        brlist[1].splice(0, 1);

        const anchor = trlist[i]!;
        const foff = (v: Pt): Pt => [v[0] + anchor[0], v[1] + anchor[1]];
        txcanv.push(...barkify(x, y, [brlist[0].map(foff), brlist[1].map(foff)]));

        for (let j = 0; j < brlist[0].length; j++) {
          if (rand() < 0.2 || j === brlist[0].length - 1) {
            twcanv.push(
              ...twig(brlist[0][j]![0] + anchor[0] + x, brlist[0][j]![1] + anchor[1] + y, 1, {
                wid: hei / 300,
                ang: ba > -Math.PI / 2 ? ba : ba + Math.PI,
                sca: (0.5 * hei) / 300,
                dir: ba > -Math.PI / 2 ? 1 : -1,
              }),
            );
          }
        }
        trmlist = trmlist.concat(brlist[0].concat(brlist[1].reverse()).map(foff));
      } else {
        trmlist.push(trlist[i]!);
      }
    }

    out.push(...trunkFinish(trmlist, x, y, col, 0.4));
    out.push(...txcanv, ...twcanv);
    return out;
  }

  /** Straighter, denser cousin of tree04 — the grove tree. */
  function tree05(x: number, y: number, args: Tree0456Args = {}): Out {
    const { hei = 300, wid = 5, col = 'rgba(100,100,100,0.5)' } = args;
    const out: Out = [];
    const txcanv: Out = [];
    const twcanv: Out = [];

    const branches = branch({ hei, wid, ang: -Math.PI / 2, ben: 0 });
    txcanv.push(...barkify(x, y, branches));
    const trlist = branches[0].concat(branches[1].reverse());

    let trmlist: Pt[] = [];
    for (let i = 0; i < trlist.length; i++) {
      const p = Math.abs(i - trlist.length * 0.5) / (trlist.length * 0.5);
      if (
        (i >= trlist.length * 0.2 && i <= trlist.length * 0.8 && i % 3 === 0 && rand() > p) ||
        i === trlist.length / 2 - 1
      ) {
        const bar = rand() * 0.2;
        const ba = -bar * Math.PI - (1 - bar * 2) * Math.PI * (i > trlist.length / 2 ? 1 : 0);
        const brlist = branch({
          hei: hei * (0.3 * p - rand() * 0.05), wid: wid * 0.5, ang: ba, ben: 0.5,
        });
        brlist[0].splice(0, 1);
        brlist[1].splice(0, 1);

        const anchor = trlist[i]!;
        for (let j = 0; j < brlist[0].length; j++) {
          if (j % 20 === 0 || j === brlist[0].length - 1) {
            twcanv.push(
              ...twig(brlist[0][j]![0] + anchor[0] + x, brlist[0][j]![1] + anchor[1] + y, 0, {
                wid: hei / 300,
                ang: ba > -Math.PI / 2 ? ba : ba + Math.PI,
                sca: (0.2 * hei) / 300,
                dir: ba > -Math.PI / 2 ? 1 : -1,
                lea: [true, 5],
              }),
            );
          }
        }
        trmlist = trmlist.concat(
          brlist[0].concat(brlist[1].reverse()).map((v) => [v[0] + anchor[0], v[1] + anchor[1]] as Pt),
        );
      } else {
        trmlist.push(trlist[i]!);
      }
    }

    out.push(...trunkFinish(trmlist, x, y, col, 0.4));
    out.push(...txcanv, ...twcanv);
    return out;
  }

  /** Recursively self-similar tree — the gnarled one. */
  function tree06(x: number, y: number, args: Tree0456Args = {}): Out {
    const { hei = 100, wid = 6, col = 'rgba(100,100,100,0.5)' } = args;
    const txcanv: Out = [];
    const twcanv: Out = [];

    function fracTree(
      xoff: number,
      yoff: number,
      dep: number,
      fargs: { hei?: number; wid?: number; ang?: number; ben?: number } = {},
    ): Pt[] {
      const { hei: fh = 300, wid: fw = 5, ang = 0, ben = Math.PI * 0.2 } = fargs;

      const branches = branch({ hei: fh, wid: fw, ang, ben, det: fh / 20 });
      txcanv.push(...barkify(xoff, yoff, branches));
      const trlist = branches[0].concat(branches[1].reverse());

      let trmlist: Pt[] = [];
      for (let i = 0; i < trlist.length; i++) {
        if (
          ((rand() < 0.025 && i >= trlist.length * 0.2 && i <= trlist.length * 0.8) ||
            i === ((trlist.length / 2) | 0) - 1 ||
            i === ((trlist.length / 2) | 0) + 1) &&
          dep > 0
        ) {
          const bar = 0.02 + rand() * 0.08;
          const ba = bar * Math.PI - bar * 2 * Math.PI * (i > trlist.length / 2 ? 1 : 0);
          const anchor = trlist[i]!;

          const brlist = fracTree(anchor[0] + xoff, anchor[1] + yoff, dep - 1, {
            hei: fh * (0.7 + rand() * 0.2), wid: fw * 0.6, ang: ang + ba, ben: 0.55,
          });

          for (const bp of brlist) {
            if (rand() < 0.03) {
              twcanv.push(
                ...twig(bp[0] + anchor[0] + xoff, bp[1] + anchor[1] + yoff, 2, {
                  ang: ba * (rand() * 0.5 + 0.75),
                  sca: 0.3,
                  dir: ba > 0 ? 1 : -1,
                  lea: [false, 0],
                }),
              );
            }
          }
          trmlist = trmlist.concat(brlist.map((v) => [v[0] + anchor[0], v[1] + anchor[1]] as Pt));
        } else {
          trmlist.push(trlist[i]!);
        }
      }
      return trmlist;
    }

    const trmlist = fracTree(x, y, 3, { hei, wid, ang: -Math.PI / 2, ben: 0 });
    return [...trunkFinish(trmlist, x, y, col, 0.4), ...txcanv, ...twcanv];
  }

  /** Triangulated and shaded rather than outlined — the reed-like one. */
  function tree07(x: number, y: number, args: Tree07Args = {}): Out {
    const {
      hei = 60, wid = 4, ben = (p: number) => Math.sqrt(p) * 0.2, col = 'rgba(100,100,100,1)',
    } = args;
    const reso = 10;
    const nslist: Pt[] = [];
    for (let i = 0; i < reso; i++) nslist.push([nz(i * 0.5), nz(i * 0.5, 0.5)]);

    const leafcol = parseRgba(col, ['100', '100', '100', '1']);
    const line1: Pt[] = [];
    const line2: Pt[] = [];
    let T: Pt[][] = [];

    for (let i = 0; i < reso; i++) {
      const nx = x + ben(i / reso) * 100;
      const ny = y - (i * hei) / reso;
      if (i >= reso / 4) {
        const bpl = brush.blobPts(
          nx + (rand() - 0.5) * wid * 1.2 * (reso - i) * 0.5,
          ny + (rand() - 0.5) * wid * 0.5,
          {
            len: rand() * 50 + 20,
            wid: rand() * 12 + 12,
            ang: (-rand() * Math.PI) / 6,
            col: rgba(leafcol, parseFloat(leafcol[3]!).toFixed(3)),
            fun: (p) =>
              p <= 1 ? 2.75 * p * (1 - p) ** (1 / 1.8) : 2.75 * (p - 2) * (p - 1) ** (1 / 1.8),
          },
        );
        T = T.concat(triangulate(bpl, { area: 50, convex: true, optimize: false }));
      }
      line1.push([nx + (nslist[i]![0] - 0.5) * wid - wid / 2, ny]);
      line2.push([nx + (nslist[i]![1] - 0.5) * wid + wid / 2, ny]);
    }

    T = triangulate(line1.concat(line2.reverse()), { area: 50, convex: true, optimize: true }).concat(T);

    return T.map((tri) => {
      const m = midPt(...(tri as [Pt, Pt, Pt]));
      const c = (nz(m[0] * 0.02, m[1] * 0.02) * 200 + 50) | 0;
      const co = `rgba(${c},${c},${c},0.8)`;
      return brush.poly(tri, { fill: co, stroke: co, width: 0 });
    });
  }

  /** Short trunk crowned with fractal twigs — the shrub. */
  function tree08(x: number, y: number, args: Tree08Args = {}): Out {
    const { hei = 80, wid = 1, col = 'rgba(100,100,100,0.5)' } = args;
    const twcanv: Out = [];
    const ang = rand.norm(-1, 1) * Math.PI * 0.2;

    const branches = branch({
      hei, wid, ang: -Math.PI / 2 + ang, ben: Math.PI * 0.2, det: hei / 20,
    });
    const trlist = branches[0].concat(branches[1].reverse());

    function fracTwig(
      xoff: number,
      yoff: number,
      dep: number,
      fargs: { ang?: number; len?: number; ben?: number } = {},
    ): Out {
      const { ang: fang = -Math.PI / 2, len = 15, ben = 0 } = fargs;
      const fun =
        dep === 0 ? (p: number) => Math.cos(0.5 * Math.PI * p) : () => 1;
      const spt: Pt = [xoff, yoff];
      const ept: Pt = [xoff + Math.cos(fang) * len, yoff + Math.sin(fang) * len];

      const bfun = rand.choice([
        (p: number) => Math.sin(p * Math.PI),
        (p: number) => -Math.sin(p * Math.PI),
      ]);

      const trmlist = brush.div([[xoff, yoff], [xoff + len, yoff]], 10);
      for (let i = 0; i < trmlist.length; i++) trmlist[i]![1] += bfun(i / trmlist.length) * 2;
      for (const p of trmlist) {
        const d = distance(p, spt);
        const a = Math.atan2(p[1] - spt[1], p[0] - spt[0]);
        p[0] = spt[0] + d * Math.cos(a + fang);
        p[1] = spt[1] + d * Math.sin(a + fang);
      }

      const tcanv: Out = [brush.stroke(trmlist, { fun, wid: 0.8, col: 'rgba(100,100,100,0.5)' })];

      if (dep !== 0) {
        const nben = ben + rand.choice([-1, 1]) * Math.PI * 0.001 * dep * dep;
        if (rand() < 0.5) {
          tcanv.push(
            ...fracTwig(ept[0], ept[1], dep - 1, {
              ang: fang + ben + Math.PI * rand.choice([rand.norm(-1, 0.5), rand.norm(0.5, 1)]) * 0.2,
              len: len * rand.norm(0.8, 0.9),
              ben: nben,
            }),
            ...fracTwig(ept[0], ept[1], dep - 1, {
              ang: fang + ben + Math.PI * rand.choice([rand.norm(-1, -0.5), rand.norm(0.5, 1)]) * 0.2,
              len: len * rand.norm(0.8, 0.9),
              ben: nben,
            }),
          );
        } else {
          tcanv.push(
            ...fracTwig(ept[0], ept[1], dep - 1, {
              ang: fang + ben, len: len * rand.norm(0.8, 0.9), ben: nben,
            }),
          );
        }
      }
      return tcanv;
    }

    for (let i = 0; i < trlist.length; i++) {
      if (rand() < 0.2) {
        twcanv.push(
          ...fracTwig(x + trlist[i]![0], y + trlist[i]![1], Math.floor(4 * rand()), {
            ang: -Math.PI / 2 - ang * rand(),
          }),
        );
      } else if (i === Math.floor(trlist.length / 2)) {
        twcanv.push(
          ...fracTwig(x + trlist[i]![0], y + trlist[i]![1], 3, { ang: -Math.PI / 2 + ang }),
        );
      }
    }

    const out: Out = [];
    out.push(brush.poly(trlist, { xof: x, yof: y, fill: 'white', stroke: col, width: 0 }));
    out.push(
      brush.stroke(
        trlist.map((v) => [v[0] + x, v[1] + y] as Pt),
        {
          col: `rgba(100,100,100,${(0.6 + rand() * 0.1).toFixed(3)})`,
          wid: 2.5,
          fun: () => Math.sin(1),
          noi: 0.9,
          out: 0,
        },
      ),
    );
    out.push(...twcanv);
    return out;
  }

  return { tree01, tree02, tree03, tree04, tree05, tree06, tree07, tree08 };
}

export type Tree = ReturnType<typeof makeTree>;
