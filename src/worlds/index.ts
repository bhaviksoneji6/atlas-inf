/**
 * The world registry.
 *
 * Adding a world is adding a planner, a draw pass and one line here. The
 * engine is not supposed to know anything about any of them — that seam is the
 * whole reason this is an atlas rather than a generator.
 *
 * `worlds` is what the interface offers; `allWorlds` is everything that still
 * builds. Topography and Ink Ridges are parked rather than deleted: the
 * engine work they exercise is load-bearing (the quadtree, the canvas
 * renderer, detail amplification) and the smoke test still boots them.
 */

import type { World } from '../engine/types';
import { shanshuiWorld } from './shanshui';
import { topoWorld } from './topo';
import { ridgesWorld } from './ridges';

/** Offered in the interface. */
export const worlds: World[] = [shanshuiWorld];

/** Everything that exists, including the parked ones. */
export const allWorlds: World[] = [shanshuiWorld, topoWorld, ridgesWorld];

export function worldById(id: string): World {
  return allWorlds.find((w) => w.id === id) ?? worlds[0]!;
}
