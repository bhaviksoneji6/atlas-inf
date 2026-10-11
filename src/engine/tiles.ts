/**
 * Tile streaming.
 *
 * Two spatial indexes, because the two world modes need different ones:
 *
 *  - scroll worlds use a 1-D strip of full-height columns, which is upstream's
 *    `chunkloader` idea (512-wide chunks extended left or right as the viewport
 *    nears an edge), minus the sequential generation order;
 *  - zoom worlds use a quadtree, where the level is chosen from the current
 *    scale so a tile always covers roughly the same number of pixels, and the
 *    generator is told the level so it can add octaves rather than magnify.
 */

import type { View, World } from './types';

export interface Tile {
  key: string;
  level: number;
  ix: number;
  iy: number;
  /** Bounds in world coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounded LRU cache of generated tiles. */
export class TileCache<T> {
  private map = new Map<string, T>();

  constructor(private budget = 192) {}

  get(key: string, make: () => T): T {
    const hit = this.map.get(key);
    if (hit !== undefined) {
      // Refresh recency: delete + set moves the key to the end of the Map.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const made = make();
    this.map.set(key, made);
    if (this.map.size > this.budget) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    return made;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Which zoom level to generate at, for a given scale. */
export function levelFor(view: View, world: World, maxLevel = 12): number {
  const ratio = view.scale / world.initialScale;
  const level = Math.floor(Math.log2(Math.max(ratio, 1e-6)));
  return Math.min(Math.max(level, 0), maxLevel);
}

/**
 * The tiles covering `view`, with one tile of margin so geometry is ready
 * before it scrolls in. Features may overhang their tile, so worlds should
 * generate a little beyond their bounds and let the renderer clip.
 */
export function visibleTiles(view: View, world: World, maxLevel = 12): Tile[] {
  const tiles: Tile[] = [];

  if (world.mode === 'scroll') {
    const w = world.tileSize;
    const h = world.bandHeight ?? world.tileSize;
    const i0 = Math.floor(view.x / w) - 1;
    const i1 = Math.ceil((view.x + view.w) / w) + 1;
    for (let ix = i0; ix <= i1; ix++) {
      tiles.push({ key: `0/${ix}/0`, level: 0, ix, iy: 0, x: ix * w, y: 0, w, h });
    }
    return tiles;
  }

  const level = levelFor(view, world, maxLevel);
  const size = world.tileSize / 2 ** level;

  // No margin ring here, unlike the scroll strip. Zoom tiles are large relative
  // to the viewport, so `floor`/`ceil` alone already overshoot the visible rect
  // by most of a tile on each side; adding a ring on top turned a 1-tile-wide
  // view into 25 generated tiles.
  const i0 = Math.floor(view.x / size);
  const i1 = Math.ceil((view.x + view.w) / size);
  const j0 = Math.floor(view.y / size);
  const j1 = Math.ceil((view.y + view.h) / size);

  // A hard cap: if a view somehow asks for thousands of tiles, drop a level
  // rather than lock the main thread generating them.
  const count = (i1 - i0 + 1) * (j1 - j0 + 1);
  if (count > 64 && level > 0) {
    return visibleTiles({ ...view, scale: view.scale / 2 }, world, maxLevel);
  }

  for (let ix = i0; ix <= i1; ix++) {
    for (let iy = j0; iy <= j1; iy++) {
      tiles.push({
        key: `${level}/${ix}/${iy}`,
        level,
        ix,
        iy,
        x: ix * size,
        y: iy * size,
        w: size,
        h: size,
      });
    }
  }
  return tiles;
}
