/**
 * The world registry.
 *
 * Adding a world is adding a planner, a draw pass and one line here. The
 * engine is not supposed to know anything about any of them — that seam is the
 * whole reason this is an atlas rather than a generator.
 */

import type { World } from '../engine/types';
import { topoWorld } from './topo';
import { ridgesWorld } from './ridges';

export const worlds: World[] = [topoWorld, ridgesWorld];

export function worldById(id: string): World {
  return worlds.find((w) => w.id === id) ?? worlds[0]!;
}
