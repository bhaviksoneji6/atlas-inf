import type { Noise } from './noise';
import type { Rng } from './rng';
import type { Brush } from './brush';

export type Pt = [number, number];

/**
 * The single geometry primitive every world emits and every renderer consumes.
 *
 * Upstream concatenates SVG strings as it generates. Keeping geometry typed
 * instead is what lets one world render to SVG *or* canvas, and what makes
 * "download as SVG" free even for a canvas world.
 */
export interface Polyline {
  pts: Pt[];
  fill?: string;
  stroke?: string;
  width?: number;
  /** Painter's-order hint; lower draws first. Worlds use it for depth. */
  z?: number;
}

/** The world-space rectangle currently visible, plus how it maps to pixels. */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Device-independent pixels per world unit. */
  scale: number;
}

/** What a world is handed to generate one tile. */
export interface GenContext {
  seed: number;
  /** Tile bounds in world coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Zoom level; always 0 for scroll worlds. */
  level: number;
  /** Quality multiplier in (0, 1]. Lower on phones and while panning fast. */
  detail: number;
  noise: Noise;
  brush: Brush;
  /** Deterministic in (seed, x, y, level) — see rng.ts. */
  rngAt(x: number, y: number): Rng;
}

export type WorldMode = 'scroll' | 'zoom';
export type RendererKind = 'svg' | 'canvas';

export interface World {
  id: string;
  name: string;
  blurb: string;
  /**
   * 'scroll' worlds pan along one axis and tile in a 1-D strip; they render to
   * SVG, where node count stays bounded because geometry scrolls out of view.
   * 'zoom' worlds tile in a quadtree and render to canvas, because a zoomed-out
   * view can hold far more geometry than the DOM will tolerate.
   */
  mode: WorldMode;
  renderer: RendererKind;
  background: string;
  ink: string;
  /** Tile edge length in world units (at level 0 for zoom worlds). */
  tileSize: number;
  /**
   * Scroll worlds only: the fixed vertical extent of the band, in world units.
   * Tiles are then full-height columns `tileSize` wide, as upstream does with
   * its 512-wide chunks over an 800-tall scroll.
   */
  bandHeight?: number;
  /**
   * How many extra tiles to keep either side of the viewport. The default of
   * one suits worlds whose features stay inside the tile that planted them;
   * raise it where a feature can extend well past its own chunk, or it will
   * only appear once its origin scrolls into view.
   */
  tileMargin?: number;
  /** Starting pixels-per-world-unit. */
  initialScale: number;
  generate(ctx: GenContext): Polyline[];
}

export interface Renderer {
  readonly kind: RendererKind;
  /** `Element`, not `HTMLElement`: the SVG renderer's root is an SVGSVGElement. */
  readonly el: Element;
  resize(w: number, h: number): void;
  /**
   * `key` identifies the geometry. When it is unchanged from the previous
   * frame a renderer may move the view without rebuilding anything — which is
   * the difference between a scroll world being usable and not, once a screen
   * holds tens of thousands of paths.
   */
  frame(view: View, geometry: Polyline[], background: string, key?: string): void;
  destroy(): void;
}
