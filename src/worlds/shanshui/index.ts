/**
 * Shan Shui — an endless Chinese landscape scroll.
 *
 * A reconstruction of shan-shui-inf by Lingdong Huang (MIT, (c) 2018) on this
 * engine. The generators in this directory are ports of his; what is new is
 * that they are driven by coordinate-seeded randomness instead of one
 * sequential stream, so the scroll is the same every time you open a given
 * seed and a link reproduces the exact view.
 *
 * Still to port: `Arch` (houses, pagodas, boats, towers) and `Man`. Until
 * then the boats planned by the planner are skipped and the mountains carry
 * no buildings — see the `arch` hook in mount.ts.
 */

import { makeBrush } from '../../engine/brush';
import { makeRand } from '../../engine/math';
import { makeNoise } from '../../engine/noise';
import { hashInts, makeRng } from '../../engine/rng';
import type { GenContext, Polyline, World } from '../../engine/types';
import { makeInk } from './ink';
import { makeMount } from './mount';
import { planChunk } from './planner';
import { makeTree } from './tree';
import { water } from './water';

const BAND = 800;

/** One item of generated geometry plus the depth it sorts at. */
interface Piece {
  y: number;
  geo: Polyline[];
}

export const shanshuiWorld: World = {
  id: 'shanshui',
  name: 'Shan Shui',
  blurb:
    'An endless Chinese landscape scroll — mountains, trees and water, generated as you go. After Lingdong Huang.',
  mode: 'scroll',
  renderer: 'svg',
  /**
   * Warm paper, not white. Upstream paints a 512px noise tile whose pixels are
   * `c = 245 + noise*10 - random*20` with the green and blue channels scaled
   * to 0.95 and 0.85 — averaging about rgb(240,228,204). The exact grain is a
   * chrome concern, but the tone is not optional: every mountain is filled
   * white, and on a near-white page they simply disappear.
   */
  background: '#f0e4cc',
  ink: '#333333',
  tileSize: 512,
  bandHeight: BAND,
  initialScale: 1,
  // Features reach past the chunk that planted them — a flat mountain is up
  // to 1000 wide and a distant range 1500 — so the strip keeps two chunks of
  // margin either side. With one, they would pop in as their site scrolled
  // into view instead of already being there.
  tileMargin: 2,

  generate(ctx: GenContext): Polyline[] {
    const seed = ctx.seed;

    // The planner gets its own stream, keyed to the chunk. Each feature then
    // gets a stream keyed to where it stands, so a mountain draws identically
    // no matter which direction you arrived from.
    const planInk = makeInkFor(seed, hashInts(seed, Math.round(ctx.x), 0x51A4));
    const plan = planChunk(planInk, ctx.x, ctx.x + ctx.w);

    const pieces: Piece[] = [];

    for (const f of plan) {
      const fseed = hashInts(seed, Math.round(f.x), Math.round(f.y));
      const ink = makeInkFor(seed, fseed);
      const tree = makeTree(ink);
      const mount = makeMount(ink, tree);
      // Upstream passes a small float as the generator's noise offset; the
      // value only has to be stable per feature, not sequential.
      const nseed = (fseed % 1000) / 10;

      if (f.tag === 'mount') {
        pieces.push({
          y: f.y,
          geo: mount.mountain(f.x, f.y, nseed, { tex: Math.round(200 * ctx.detail) }),
        });
        // Water sits behind everything, as upstream's y - 10000 arranges.
        pieces.push({ y: -Infinity, geo: water(ink, f.x, f.y) });
      } else if (f.tag === 'flatmount') {
        pieces.push({
          y: f.y,
          geo: mount.flatMount(f.x, f.y, nseed, {
            wid: 600 + ink.rand() * 400,
            hei: 100,
            cho: 0.5 + ink.rand() * 0.2,
            tex: Math.round(80 * ctx.detail),
          }),
        });
      } else if (f.tag === 'distmount') {
        const len = ink.rand.choice([500, 1000, 1500]);
        pieces.push({
          y: f.y,
          // Centred on its site rather than starting there. Upstream draws a
          // distant range rightwards from its x, so a range reached 1500 past
          // the chunk that planted it and the strip needed three chunks of
          // margin to catch one. Centring halves the reach and costs nothing
          // compositionally — the range is a backdrop, not a landmark.
          geo: mount.distMount(f.x - len / 2, f.y, nseed, { hei: 150, len }),
        });
      }
      // 'boat' needs Arch.boat01, which is not ported yet.
    }

    // Painter's order by depth, exactly as upstream's chunk list is kept
    // sorted by y. Within a piece, push order already is draw order.
    pieces.sort((a, b) => a.y - b.y);
    return pieces.flatMap((p) => p.geo);
  },
};

function makeInkFor(worldSeed: number, streamSeed: number) {
  const noise = makeNoise(worldSeed);
  const rng = makeRng(streamSeed);
  return makeInk(makeRand(rng), noise, makeBrush(rng, noise));
}
