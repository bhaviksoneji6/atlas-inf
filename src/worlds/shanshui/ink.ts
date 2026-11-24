/**
 * The context the ported shan-shui generators draw into.
 *
 * Upstream reads three globals: an overridden `Math.random`, a module-global
 * `Noise`, and the drawing primitives. All three arrive here explicitly
 * instead, so a generator is a pure function of what it is handed and two
 * tiles can be generated independently.
 */

import type { Brush } from '../../engine/brush';
import type { Noise } from '../../engine/noise';
import type { Rand } from '../../engine/math';
import type { Polyline } from '../../engine/types';

export interface Ink {
  rand: Rand;
  brush: Brush;
  /**
   * Upstream's `Noise.noise(x[, y[, z]])`, which is one 3-D function with the
   * missing arguments defaulting to zero. Routing every call through `noise3`
   * keeps that identity — `nz(x)` and `nz(x, 0, 0)` must agree, or generators
   * that call it both ways would disagree with themselves.
   */
  nz(x: number, y?: number, z?: number): number;
}

export function makeInk(rand: Rand, noise: Noise, brush: Brush): Ink {
  return {
    rand,
    brush,
    nz: (x, y = 0, z = 0) => noise.noise3(x, y, z),
  };
}

/**
 * Upstream builds colours as `rgba(...)` strings and then picks them apart to
 * derive leaf tints. Kept as-is rather than modelled properly: every tuned
 * alpha in the ported generators is written in terms of this string surgery.
 */
export function parseRgba(col: string, fallback = ['100', '100', '100', '0.5']): string[] {
  if (!col.includes('rgba(')) return fallback;
  return col.replace('rgba(', '').replace(')', '').split(',');
}

export function rgba(parts: string[], alpha: number | string): string {
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
}

/** Shorthand used throughout the ports. */
export type Out = Polyline[];
