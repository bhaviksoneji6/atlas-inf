/**
 * SVG renderer, for the scroll worlds.
 *
 * Viable here precisely because a scroll world's viewport is narrow and
 * geometry leaves the DOM as it scrolls out, which is the same bet upstream
 * makes. It is the wrong choice for a zoomed-out view holding 100k nodes —
 * that is what the canvas renderer is for.
 */

import type { Polyline, Renderer, View } from '../types';

function pathData(pts: Polyline['pts']): string {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    d += (i === 0 ? 'M' : 'L') + pts[i]![0].toFixed(1) + ' ' + pts[i]![1].toFixed(1);
  }
  return d;
}

function serialize(geometry: Polyline[]): string {
  const ordered = [...geometry].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  let out = '';
  for (const g of ordered) {
    if (g.pts.length < 2) continue;
    out +=
      `<path d="${pathData(g.pts)}" fill="${g.fill ?? 'none'}"` +
      ` stroke="${g.stroke ?? 'none'}" stroke-width="${g.width ?? 0}"` +
      ` stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return out;
}

export class SvgRenderer implements Renderer {
  readonly kind = 'svg' as const;
  readonly el: SVGSVGElement;
  private group: SVGGElement;
  /** The geometry currently in the DOM, so panning need not rebuild it. */
  private lastKey: string | undefined;

  constructor() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'stage');
    this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.group);
    this.el = svg;
  }

  resize(w: number, h: number): void {
    this.el.setAttribute('width', String(w));
    this.el.setAttribute('height', String(h));
  }

  frame(view: View, geometry: Polyline[], background: string, key?: string): void {
    // The background is the host element's, not the surface's, so the paper
    // texture behind it shows through. `background` stays in the signature
    // because the canvas renderer must clear with it.
    void background;
    // Panning is a viewBox change, nothing more. Serialising ~50k paths costs
    // tens of megabytes of string per frame; upstream sidesteps the same
    // problem by regenerating only at chunk boundaries and otherwise calling
    // its `viewupdate`.
    this.el.setAttribute(
      'viewBox',
      `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`,
    );
    if (key !== undefined && key === this.lastKey) return;
    this.lastKey = key;
    this.group.innerHTML = serialize(geometry);
  }

  destroy(): void {
    this.el.remove();
  }
}

/**
 * Download-ready SVG of the current view.
 *
 * Available for canvas worlds too, since geometry stays typed all the way to
 * the renderer — which is the main dividend of not concatenating strings during
 * generation. Pen-plotter people will want this.
 */
export function toSvgDocument(view: View, geometry: Polyline[], background: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(view.w)}" ` +
    `height="${Math.round(view.h)}" ` +
    `viewBox="${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}">` +
    `<rect x="${view.x.toFixed(1)}" y="${view.y.toFixed(1)}" ` +
    `width="${view.w.toFixed(1)}" height="${view.h.toFixed(1)}" fill="${background}"/>` +
    serialize(geometry) +
    `</svg>\n`
  );
}
