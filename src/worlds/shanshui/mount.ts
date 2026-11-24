/**
 * Mountains, flat-topped mesas, distant ranges and rocks.
 *
 * Adapted from the `Mount` module of shan-shui-inf by Lingdong Huang
 * (MIT, (c) 2018), vendor/shan-shui-inf/index.html lines 1727-2523.
 *
 * Modified: globals -> an `Ink` context and an injected `Tree`; SVG strings ->
 * `Polyline[]`. Upstream's calls into `Arch` (pagodas, houses, towers) are
 * routed through the optional `arch` hook instead, so this module can ship
 * before that one is ported; supply nothing and the mountains simply have no
 * buildings on them.
 *
 * `mountain` is structured as a height-field of nested outlines plus a series
 * of `vegetate` passes, each of which walks the field and plants something
 * wherever a growth rule fires. That is the pattern worth understanding: the
 * mountain is not drawn, it is *populated*.
 */

import { midPt, triangulate } from '../../engine/poly-tools';
import type { Pt } from '../../engine/types';
import type { Ink, Out } from './ink';
import type { Tree } from './tree';

export interface Bound { xmin: number; xmax: number; ymin: number; ymax: number }

/** Upstream's `Arch` entry points, as `Mount` uses them. */
export interface ArchHooks {
  arch01?(x: number, y: number, seed: number, args: { wid: number; hei: number; per: number }): Out;
  arch02?(
    x: number, y: number, seed: number,
    args: { wid: number; sto: number; rot: number; sty: number },
  ): Out;
  arch03?(x: number, y: number, seed: number, args: { sto: number; wid: number }): Out;
  arch04?(x: number, y: number, seed: number, args: { sto: number }): Out;
  transmissionTower01?(x: number, y: number, seed: number): Out;
}

export interface MountainArgs {
  hei?: number; wid?: number; tex?: number; veg?: boolean;
  col?: (x: number) => string;
}
export interface FlatMountArgs { hei?: number; wid?: number; tex?: number; cho?: number }
export interface DistMountArgs { hei?: number; len?: number; seg?: number }
export interface RockArgs { hei?: number; wid?: number; tex?: number; sha?: number }

export function makeMount(ink: Ink, tree: Tree, arch: ArchHooks = {}) {
  const { rand, brush, nz } = ink;

  /** The skirt of overlapping ridges at a mountain's base. */
  function foot(ptlist: Pt[][], args: { xof?: number; yof?: number } = {}): Out {
    const { xof = 0, yof = 0 } = args;
    const ftlist: Pt[][] = [];
    const span = 10;
    let ni = 0;

    for (let i = 0; i < ptlist.length - 2; i++) {
      if (i !== ni) continue;
      ni = Math.min(ni + rand.choice([1, 2]), ptlist.length - 1);

      ftlist.push([], []);
      const a = ftlist[ftlist.length - 2]!;
      const b = ftlist[ftlist.length - 1]!;
      const row = ptlist[i]!;

      for (let j = 0; j < Math.min(row.length / 8, 10); j++) {
        a.push([row[j]![0] + nz(j * 0.1, i) * 10, row[j]![1]]);
        b.push([row[row.length - 1 - j]![0] - nz(j * 0.1, i) * 10, row[row.length - 1 - j]![1]]);
      }
      a.reverse();
      b.reverse();

      const nrow = ptlist[ni]!;
      for (let j = 0; j < span; j++) {
        const p = j / span;
        let x1 = row[0]![0] * (1 - p) + nrow[0]![0] * p;
        let y1 = row[0]![1] * (1 - p) + nrow[0]![1] * p;
        let x2 = row[row.length - 1]![0] * (1 - p) + (nrow[row.length - 1]?.[0] ?? 0) * p;
        let y2 = row[row.length - 1]![1] * (1 - p) + (nrow[row.length - 1]?.[1] ?? 0) * p;

        const vib = -1.7 * (p - 1) * p ** (1 / 5);
        y1 += vib * 5 + nz(xof * 0.05, i) * 5;
        y2 += vib * 5 + nz(xof * 0.05, i) * 5;

        a.push([x1, y1]);
        b.push([x2, y2]);
      }
    }

    const out: Out = [];
    for (const f of ftlist) {
      out.push(brush.poly(f, { xof, yof, fill: 'white', stroke: 'none' }));
    }
    for (const f of ftlist) {
      out.push(
        brush.stroke(
          f.map((p) => [p[0] + xof, p[1] + yof] as Pt),
          { col: `rgba(100,100,100,${(0.1 + rand() * 0.1).toFixed(3)})`, wid: 1 },
        ),
      );
    }
    return out;
  }

  function mountain(xoff: number, yoff: number, seed = 0, args: MountainArgs = {}): Out {
    const {
      hei = 100 + rand() * 400,
      wid = 400 + rand() * 200,
      tex = 200,
      veg = true,
      col,
    } = args;

    const out: Out = [];
    const ptlist: Pt[][] = [];
    const h = hei;
    const w = wid;
    const reso: [number, number] = [10, 50];

    let hoff = 0;
    for (let j = 0; j < reso[0]; j++) {
      hoff += (rand() * yoff) / 100;
      const row: Pt[] = [];
      for (let i = 0; i < reso[1]; i++) {
        const x = (i / reso[1] - 0.5) * Math.PI;
        let y = Math.cos(x);
        y *= nz(x + 10, j * 0.15, seed);
        const p = 1 - j / reso[0];
        row.push([(x / Math.PI) * w * p, -y * h * p + hoff]);
      }
      ptlist.push(row);
    }

    /**
     * Walk the height field; wherever `growthRule` fires, collect a site, then
     * plant at every site `proofRule` accepts. The two-stage shape is what
     * lets a rule depend on its neighbours — the mid-slope trees only grow
     * where at least three others already want to.
     */
    function vegetate(
      treeFunc: (x: number, y: number) => Out,
      growthRule: (i: number, j: number) => boolean,
      proofRule: (veglist: Pt[], i: number) => boolean,
    ): void {
      const veglist: Pt[] = [];
      for (let i = 0; i < ptlist.length; i++) {
        for (let j = 0; j < ptlist[i]!.length; j++) {
          if (growthRule(i, j)) veglist.push([ptlist[i]![j]![0], ptlist[i]![j]![1]]);
        }
      }
      for (let i = 0; i < veglist.length; i++) {
        if (proofRule(veglist, i)) out.push(...treeFunc(veglist[i]![0], veglist[i]![1]));
      }
    }

    // RIM
    vegetate(
      (x, y) =>
        tree.tree02(x + xoff, y + yoff - 5, {
          col: `rgba(100,100,100,${(nz(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5).toFixed(3)})`,
          clu: 2,
        }),
      (i, j) => {
        const ns = nz(j * 0.1, seed);
        return i === 0 && ns * ns * ns < 0.1 && Math.abs(ptlist[i]![j]![1]) / h > 0.2;
      },
      () => true,
    );

    // WHITE BG
    out.push(
      brush.poly(ptlist[0]!.concat([[0, reso[0] * 4]]), {
        xof: xoff, yof: yoff, fill: 'white', stroke: 'none',
      }),
    );
    // OUTLINE
    out.push(
      brush.stroke(
        ptlist[0]!.map((p) => [p[0] + xoff, p[1] + yoff] as Pt),
        { col: 'rgba(100,100,100,0.3)', noi: 1, wid: 3 },
      ),
    );

    out.push(...foot(ptlist, { xof: xoff, yof: yoff }));
    out.push(
      ...brush.texture(ptlist, {
        xof: xoff, yof: yoff, tex, sha: rand.choice([0, 0, 0, 0, 5]), col,
      }),
    );

    // TOP
    vegetate(
      (x, y) =>
        tree.tree02(x + xoff, y + yoff, {
          col: `rgba(100,100,100,${(nz(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5).toFixed(3)})`,
        }),
      (i, j) => {
        const ns = nz(i * 0.1, j * 0.1, seed + 2);
        return ns * ns * ns < 0.1 && Math.abs(ptlist[i]![j]![1]) / h > 0.5;
      },
      () => true,
    );

    if (veg) {
      // MIDDLE
      vegetate(
        (x, y) => {
          let ht = ((h + y) / h) * 70;
          ht = ht * 0.3 + rand() * ht * 0.7;
          return tree.tree01(x + xoff, y + yoff, {
            hei: ht,
            wid: rand() * 3 + 1,
            col: `rgba(100,100,100,${(nz(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.3).toFixed(3)})`,
          });
        },
        (i, j) => {
          const ns = nz(i * 0.2, j * 0.05, seed);
          return j % 2 === 1 && ns ** 4 < 0.012 && Math.abs(ptlist[i]![j]![1]) / h < 0.3;
        },
        (veglist, i) => {
          let counter = 0;
          for (let j = 0; j < veglist.length; j++) {
            if (
              i !== j &&
              (veglist[i]![0] - veglist[j]![0]) ** 2 + (veglist[i]![1] - veglist[j]![1]) ** 2 <
                30 * 30
            ) {
              counter++;
            }
            if (counter > 2) return true;
          }
          return false;
        },
      );

      // BOTTOM
      vegetate(
        (x, y) => {
          let ht = ((h + y) / h) * 120;
          ht = ht * 0.5 + rand() * ht * 0.5;
          const bc = rand() * 0.1;
          return tree.tree03(x + xoff, y + yoff, {
            hei: ht,
            ben: (p) => (p * bc) ** 1,
            col: `rgba(100,100,100,${(nz(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.3).toFixed(3)})`,
          });
        },
        (i, j) => {
          const ns = nz(i * 0.2, j * 0.05, seed);
          return (j === 0 || j === ptlist[i]!.length - 1) && ns ** 4 < 0.012;
        },
        () => true,
      );
    }

    // BOTT ARCH
    vegetate(
      (x, y) => {
        const tt = rand.choice([0, 0, 1, 1, 1, 2]);
        if (tt === 1 && arch.arch02) {
          return arch.arch02(x + xoff, y + yoff, seed, {
            wid: rand.norm(40, 70),
            sto: rand.choice([1, 2, 2, 3]),
            rot: rand(),
            sty: rand.choice([1, 2, 3]),
          });
        }
        if (tt === 2 && arch.arch04) {
          return arch.arch04(x + xoff, y + yoff, seed, { sto: rand.choice([1, 1, 1, 2, 2]) });
        }
        return [];
      },
      (i, j) => {
        const ns = nz(i * 0.2, j * 0.05, seed + 10);
        return i !== 0 && (j === 1 || j === ptlist[i]!.length - 2) && ns ** 4 < 0.008;
      },
      () => true,
    );

    // TOP ARCH
    vegetate(
      (x, y) =>
        arch.arch03
          ? arch.arch03(x + xoff, y + yoff, seed, {
              sto: rand.choice([5, 7]), wid: 40 + rand() * 20,
            })
          : [],
      (i, j) => i === 1 && Math.abs(j - ptlist[i]!.length / 2) < 1 && rand() < 0.02,
      () => true,
    );

    // TRANSM
    vegetate(
      (x, y) =>
        arch.transmissionTower01 ? arch.transmissionTower01(x + xoff, y + yoff, seed) : [],
      (i, j) => {
        const ns = nz(i * 0.2, j * 0.05, seed + 20 * Math.PI);
        return i % 2 === 0 && (j === 1 || j === ptlist[i]!.length - 2) && ns ** 4 < 0.002;
      },
      () => true,
    );

    // BOTT ROCK
    vegetate(
      (x, y) =>
        rock(x + xoff, y + yoff, seed, {
          wid: 20 + rand() * 20, hei: 20 + rand() * 20, sha: 2,
        }),
      (i, j) => (j === 0 || j === ptlist[i]!.length - 1) && rand() < 0.1,
      () => true,
    );

    return out;
  }

  function flatMount(xoff: number, yoff: number, seed = 0, args: FlatMountArgs = {}): Out {
    const {
      hei = 40 + rand() * 400, wid = 400 + rand() * 200, tex = 80, cho = 0.5,
    } = args;

    const out: Out = [];
    const ptlist: Pt[][] = [];
    const reso: [number, number] = [5, 50];
    let hoff = 0;
    const flat: Pt[][] = [];

    for (let j = 0; j < reso[0]; j++) {
      hoff += (rand() * yoff) / 100;
      const row: Pt[] = [];
      const frow: Pt[] = [];
      ptlist.push(row);
      flat.push(frow);
      for (let i = 0; i < reso[1]; i++) {
        const x = (i / reso[1] - 0.5) * Math.PI;
        let y = Math.cos(x * 2) + 1;
        y *= nz(x + 10, j * 0.1, seed);
        const p = 1 - (j / reso[0]) * 0.6;
        const nx = (x / Math.PI) * wid * p;
        let ny = -y * hei * p + hoff;
        const h = 100;

        if (ny < -h * cho + hoff) {
          ny = -h * cho + hoff;
          if (frow.length % 2 === 0) frow.push([nx, ny]);
        } else if (frow.length % 2 === 1) {
          frow.push(row[row.length - 1]!);
        }
        row.push([nx, ny]);
      }
    }

    out.push(
      brush.poly(ptlist[0]!.concat([[0, reso[0] * 4]]), {
        xof: xoff, yof: yoff, fill: 'white', stroke: 'none',
      }),
    );
    out.push(
      brush.stroke(
        ptlist[0]!.map((p) => [p[0] + xoff, p[1] + yoff] as Pt),
        { col: 'rgba(100,100,100,0.3)', noi: 1, wid: 3 },
      ),
    );
    out.push(
      ...brush.texture(ptlist, {
        xof: xoff, yof: yoff, tex, wid: 2,
        dis: () => (rand() > 0.5 ? 0.1 + 0.4 * rand() : 0.9 - 0.4 * rand()),
      }),
    );

    // The flat top, traced from where the height field was clamped.
    let grlist1: Pt[] = [];
    let grlist2: Pt[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      if (flat[i]!.length >= 2) {
        grlist1.push(flat[i]![0]!);
        grlist2.push(flat[i]![flat[i]!.length - 1]!);
      }
    }
    if (grlist1.length === 0) return out;

    let wb = [grlist1[0]![0], grlist2[0]![0]];
    for (let i = 0; i < 3; i++) {
      const p = 0.8 - i * 0.2;
      grlist1.unshift([wb[0]! * p, grlist1[0]![1] - 5]);
      grlist2.unshift([wb[1]! * p, grlist2[0]![1] - 5]);
    }
    wb = [grlist1[grlist1.length - 1]![0], grlist2[grlist2.length - 1]![0]];
    for (let i = 0; i < 3; i++) {
      const p = 0.6 - i * i * 0.1;
      grlist1.push([wb[0]! * p, grlist1[grlist1.length - 1]![1] + 1]);
      grlist2.push([wb[1]! * p, grlist2[grlist2.length - 1]![1] + 1]);
    }

    const d = 5;
    grlist1 = brush.div(grlist1, d);
    grlist2 = brush.div(grlist2, d);

    const grlist = grlist1.reverse().concat(grlist2.concat([grlist1[0]!]));
    for (let i = 0; i < grlist.length; i++) {
      const v = (1 - Math.abs((i % d) - d / 2) / (d / 2)) * 0.12;
      grlist[i]![0] *= 1 - v + nz(grlist[i]![1] * 0.5) * v;
    }

    out.push(brush.poly(grlist, { xof: xoff, yof: yoff, stroke: 'none', fill: 'white', width: 2 }));
    out.push(
      brush.stroke(
        grlist.map((p) => [p[0] + xoff, p[1] + yoff] as Pt),
        { wid: 3, col: 'rgba(100,100,100,0.2)' },
      ),
    );

    out.push(...flatDec(xoff, yoff, bound(grlist)));
    return out;
  }

  function bound(plist: Pt[]): Bound {
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;
    for (const p of plist) {
      xmin = Math.min(xmin, p[0]);
      xmax = Math.max(xmax, p[0]);
      ymin = Math.min(ymin, p[1]);
      ymax = Math.max(ymax, p[1]);
    }
    return { xmin, xmax, ymin, ymax };
  }

  /** What stands on a flat top: one of five scenes, chosen by lottery. */
  function flatDec(xoff: number, yoff: number, grbd: Bound): Out {
    const out: Out = [];
    const tt = rand.choice([0, 0, 1, 2, 3, 4]);
    const midY = (grbd.ymin + grbd.ymax) / 2;

    for (let j = 0; j < rand() * 5; j++) {
      out.push(
        ...rock(
          xoff + rand.norm(grbd.xmin, grbd.xmax),
          yoff + midY + rand.norm(-10, 10) + 10,
          rand() * 100,
          { wid: 10 + rand() * 20, hei: 10 + rand() * 20, sha: 2 },
        ),
      );
    }

    for (let j = 0; j < rand.choice([0, 0, 1, 2]); j++) {
      const xr = xoff + rand.norm(grbd.xmin, grbd.xmax);
      const yr = yoff + midY + rand.norm(-5, 5) + 20;
      for (let k = 0; k < 2 + rand() * 3; k++) {
        out.push(
          ...tree.tree08(
            xr + Math.min(Math.max(rand.norm(-30, 30), grbd.xmin), grbd.xmax),
            yr,
            { hei: 60 + rand() * 40 },
          ),
        );
      }
    }

    if (tt === 0) {
      for (let j = 0; j < rand() * 3; j++) {
        out.push(
          ...rock(
            xoff + rand.norm(grbd.xmin, grbd.xmax),
            yoff + midY + rand.norm(-5, 5) + 20,
            rand() * 100,
            { wid: 50 + rand() * 20, hei: 40 + rand() * 20, sha: 5 },
          ),
        );
      }
    } else if (tt === 1) {
      const pmin = rand() * 0.5;
      const pmax = rand() * 0.5 + 0.5;
      const xmin = grbd.xmin * (1 - pmin) + grbd.xmax * pmin;
      const xmax = grbd.xmin * (1 - pmax) + grbd.xmax * pmax;
      for (let i = xmin; i < xmax; i += 30) {
        out.push(
          ...tree.tree05(xoff + i + 20 * rand.norm(-1, 1), yoff + midY + 20, {
            hei: 100 + rand() * 200,
          }),
        );
      }
      for (let j = 0; j < rand() * 4; j++) {
        out.push(
          ...rock(
            xoff + rand.norm(grbd.xmin, grbd.xmax),
            yoff + midY + rand.norm(-5, 5) + 20,
            rand() * 100,
            { wid: 50 + rand() * 20, hei: 40 + rand() * 20, sha: 5 },
          ),
        );
      }
    } else if (tt === 2) {
      for (let i = 0; i < rand.choice([1, 1, 1, 1, 2, 2, 3]); i++) {
        const xr = rand.norm(grbd.xmin, grbd.xmax);
        const yr = midY;
        out.push(...tree.tree04(xoff + xr, yoff + yr + 20, {}));
        for (let j = 0; j < rand() * 2; j++) {
          out.push(
            ...rock(
              xoff + Math.max(grbd.xmin, Math.min(grbd.xmax, xr + rand.norm(-50, 50))),
              yoff + yr + rand.norm(-5, 5) + 20,
              j * i * rand() * 100,
              { wid: 50 + rand() * 20, hei: 40 + rand() * 20, sha: 5 },
            ),
          );
        }
      }
    } else if (tt === 3) {
      for (let i = 0; i < rand.choice([1, 1, 1, 1, 2, 2, 3]); i++) {
        out.push(
          ...tree.tree06(xoff + rand.norm(grbd.xmin, grbd.xmax), yoff + midY, {
            hei: 60 + rand() * 60,
          }),
        );
      }
    } else if (tt === 4) {
      const pmin = rand() * 0.5;
      const pmax = rand() * 0.5 + 0.5;
      const xmin = grbd.xmin * (1 - pmin) + grbd.xmax * pmin;
      const xmax = grbd.xmin * (1 - pmax) + grbd.xmax * pmax;
      for (let i = xmin; i < xmax; i += 20) {
        out.push(
          ...tree.tree07(
            xoff + i + 20 * rand.norm(-1, 1),
            yoff + midY + rand.norm(-1, 1),
            { hei: rand.norm(40, 80) },
          ),
        );
      }
    }

    for (let i = 0; i < 50 * rand(); i++) {
      out.push(
        ...tree.tree02(
          xoff + rand.norm(grbd.xmin, grbd.xmax),
          yoff + rand.norm(grbd.ymin, grbd.ymax),
        ),
      );
    }

    const ts = rand.choice([0, 0, 0, 0, 1]);
    if (ts === 1 && tt !== 4 && arch.arch01) {
      out.push(
        ...arch.arch01(
          xoff + rand.norm(grbd.xmin, grbd.xmax),
          yoff + midY + 20,
          rand(),
          { wid: rand.norm(160, 200), hei: rand.norm(80, 100), per: rand() },
        ),
      );
    }

    return out;
  }

  /** The pale range on the horizon: flat shapes, shaded by triangulation. */
  function distMount(xoff: number, yoff: number, seed = 0, args: DistMountArgs = {}): Out {
    const { hei = 300, len = 2000, seg = 5 } = args;
    const out: Out = [];
    const span = 10;
    const ptlist: Pt[][] = [];

    for (let i = 0; i < len / span / seg; i++) {
      const row: Pt[] = [];
      ptlist.push(row);
      for (let j = 0; j < seg + 1; j++) {
        const k = i * seg + j;
        row.push([
          xoff + k * span,
          yoff - hei * nz(k * 0.05, seed) * Math.sin((Math.PI * k) / (len / span)) ** 0.5,
        ]);
      }
      for (let j = 0; j < seg / 2 + 1; j++) {
        const k = i * seg + j * 2;
        row.unshift([
          xoff + k * span,
          yoff + 24 * nz(k * 0.05, 2, seed) * Math.sin((Math.PI * k) / (len / span)),
        ]);
      }
    }

    const getCol = (x: number, y: number): string => {
      const c = (nz(x * 0.02, y * 0.02, yoff) * 55 + 200) | 0;
      return `rgb(${c},${c},${c})`;
    };

    for (const row of ptlist) {
      const last = row[row.length - 1]!;
      out.push(brush.poly(row, { fill: getCol(last[0], last[1]), stroke: 'none', width: 1 }));

      const T = triangulate(row, { area: 100, convex: true, optimize: false });
      for (const tri of T) {
        const m = midPt(...(tri as [Pt, Pt, Pt]));
        const co = getCol(m[0], m[1]);
        out.push(brush.poly(tri, { fill: co, stroke: co, width: 1 }));
      }
    }
    return out;
  }

  function rock(xoff: number, yoff: number, seed = 0, args: RockArgs = {}): Out {
    const { hei = 80, wid = 100, tex = 40, sha = 10 } = args;
    const out: Out = [];
    const reso: [number, number] = [10, 50];
    const ptlist: Pt[][] = [];

    for (let i = 0; i < reso[0]; i++) {
      const row: Pt[] = [];
      ptlist.push(row);

      const nslist: number[] = [];
      for (let j = 0; j < reso[1]; j++) nslist.push(nz(i, j * 0.2, seed));
      // Close the ring so the outline has no seam.
      const dif = nslist[nslist.length - 1]! - nslist[0]!;
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < nslist.length; j++) {
        nslist[j] = nslist[j]! + (dif * (nslist.length - 1 - j)) / (nslist.length - 1);
        lo = Math.min(lo, nslist[j]!);
        hi = Math.max(hi, nslist[j]!);
      }
      const span = hi - lo || 1;
      for (let j = 0; j < nslist.length; j++) nslist[j] = (nslist[j]! - lo) / span;

      for (let j = 0; j < reso[1]; j++) {
        const a = (j / reso[1]) * Math.PI * 2 - Math.PI / 2;
        let l = (wid * hei) / Math.hypot(hei * Math.cos(a), wid * Math.sin(a));
        l *= 0.7 + 0.3 * nslist[j]!;

        const p = 1 - i / reso[0];
        const nx = Math.cos(a) * l * p;
        let ny = -Math.sin(a) * l * p;
        if (Math.PI < a || a < 0) ny *= 0.2;
        ny += hei * (i / reso[0]) * 0.2;

        row.push([nx, ny]);
      }
    }

    out.push(
      brush.poly(ptlist[0]!.concat([[0, 0]]), {
        xof: xoff, yof: yoff, fill: 'white', stroke: 'none',
      }),
    );
    out.push(
      brush.stroke(
        ptlist[0]!.map((p) => [p[0] + xoff, p[1] + yoff] as Pt),
        { col: 'rgba(100,100,100,0.3)', noi: 1, wid: 3 },
      ),
    );
    out.push(
      ...brush.texture(ptlist, {
        xof: xoff, yof: yoff, tex, wid: 3, sha,
        col: () => `rgba(180,180,180,${(0.3 + rand() * 0.3).toFixed(3)})`,
        dis: () => (rand() > 0.5 ? 0.15 + 0.15 * rand() : 0.85 - 0.15 * rand()),
      }),
    );
    return out;
  }

  return { mountain, flatMount, flatDec, distMount, rock };
}

export type Mount = ReturnType<typeof makeMount>;
