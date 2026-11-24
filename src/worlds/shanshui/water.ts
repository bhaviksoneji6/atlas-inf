/**
 * Water: a stack of drifting horizontal strokes.
 *
 * Adapted from `water` in shan-shui-inf by Lingdong Huang (MIT, (c) 2018),
 * vendor/shan-shui-inf/index.html lines 3667-3704.
 *
 * Upstream draws this behind everything by giving the chunk a y of
 * `mountain.y - 10000` so the depth sort puts it first. The world here does
 * the same thing with an explicit sort key rather than a magic offset.
 */

import type { Pt } from '../../engine/types';
import type { Ink, Out } from './ink';

export interface WaterArgs { hei?: number; len?: number; clu?: number }

export function water(ink: Ink, xoff: number, yoff: number, args: WaterArgs = {}): Out {
  const { rand, brush, nz } = ink;
  const { hei = 2, len = 800, clu = 10 } = args;

  const ptlist: Pt[][] = [];
  let yk = 0;
  for (let i = 0; i < clu; i++) {
    const row: Pt[] = [];
    ptlist.push(row);
    const xk = (rand() - 0.5) * (len / 8);
    yk += rand() * 5;
    const lk = len / 4 + rand() * (len / 4);
    const reso = 5;
    for (let j = -lk; j < lk; j += reso) {
      row.push([j + xk, Math.sin(j * 0.2) * hei * nz(j * 0.1) - 20 + yk]);
    }
  }

  const out: Out = [];
  for (let j = 1; j < ptlist.length; j++) {
    if (ptlist[j]!.length < 2) continue;
    out.push(
      brush.stroke(
        ptlist[j]!.map((p) => [p[0] + xoff, p[1] + yoff] as Pt),
        { col: `rgba(100,100,100,${(0.3 + rand() * 0.3).toFixed(3)})`, wid: 1 },
      ),
    );
  }
  return out;
}
