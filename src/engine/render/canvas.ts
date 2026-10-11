/**
 * Canvas renderer, for the zoom worlds.
 *
 * A zoomed-out topographic view can hold six figures of geometry; the DOM will
 * not take that, and a 2-D context will. The backing store is scaled by
 * devicePixelRatio, without which every zoom world looks soft on a phone — the
 * one rendering bug that is invisible on a desktop monitor and obvious on a
 * Retina display.
 */

import type { Polyline, Renderer, View } from '../types';

export class CanvasRenderer implements Renderer {
  readonly kind = 'canvas' as const;
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor() {
    this.el = document.createElement('canvas');
    this.el.className = 'stage';
    const ctx = this.el.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2-D canvas context unavailable');
    this.ctx = ctx;
  }

  resize(w: number, h: number): void {
    // Cap at 2: beyond that the fill rate costs more than the sharpness is
    // worth on a 3x phone display.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.el.width = Math.round(w * this.dpr);
    this.el.height = Math.round(h * this.dpr);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
  }

  frame(view: View, geometry: Polyline[], background: string): void {
    const ctx = this.ctx;
    const w = this.el.width;
    const h = this.el.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);

    const k = view.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, -view.x * k, -view.y * k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const ordered = [...geometry].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const g of ordered) {
      if (g.pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(g.pts[0]![0], g.pts[0]![1]);
      for (let i = 1; i < g.pts.length; i++) {
        ctx.lineTo(g.pts[i]![0], g.pts[i]![1]);
      }
      if (g.fill && g.fill !== 'none') {
        ctx.fillStyle = g.fill;
        ctx.fill();
      }
      if (g.stroke && g.stroke !== 'none' && (g.width ?? 0) > 0) {
        ctx.strokeStyle = g.stroke;
        // Keep hairlines visible when zoomed far out.
        ctx.lineWidth = Math.max(g.width ?? 0, 0.6 / view.scale);
        ctx.stroke();
      }
    }
  }

  toPngBlob(): Promise<Blob | null> {
    return new Promise((resolve) => this.el.toBlob(resolve, 'image/png'));
  }

  destroy(): void {
    this.el.remove();
  }
}
