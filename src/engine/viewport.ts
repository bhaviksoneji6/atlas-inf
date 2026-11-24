/**
 * Pan and zoom, including the parts a phone fights you on.
 *
 * Every gesture is handled here rather than left to the browser: pointer events
 * for drag, a two-pointer pinch for zoom, wheel for desktop. The CSS side of
 * this (`touch-action: none`, `overscroll-behavior: none`, `100dvh`) lives in
 * style.css and is load-bearing — without it iOS claims the gestures first and
 * pull-to-refresh fires mid-pan.
 */

import type { View, World } from './types';

export interface ViewportOptions {
  el: HTMLElement;
  world: World;
  onChange(view: View, settled: boolean): void;
}

export class Viewport {
  /** Centre of the view, in world coordinates. */
  cx = 0;
  cy = 0;
  scale: number;
  /** Device-independent pixel size of the container. */
  width = 1;
  height = 1;

  private el: HTMLElement;
  private world: World;
  private onChange: ViewportOptions['onChange'];
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchScale = 1;
  private settleTimer: number | undefined;
  private ro: ResizeObserver;

  constructor(opts: ViewportOptions) {
    this.el = opts.el;
    this.world = opts.world;
    this.onChange = opts.onChange;
    this.scale = opts.world.initialScale;

    if (this.world.mode === 'scroll') {
      this.cy = (this.world.bandHeight ?? this.world.tileSize) / 2;
    }

    this.el.addEventListener('pointerdown', this.onPointerDown);
    this.el.addEventListener('pointermove', this.onPointerMove);
    this.el.addEventListener('pointerup', this.onPointerUp);
    this.el.addEventListener('pointercancel', this.onPointerUp);
    this.el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);

    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(this.el);

    // Measure, but do NOT emit yet. The owner is still inside
    // `this.viewport = new Viewport(...)`, so any callback fired from here
    // reaches a half-constructed object. The first emit is the owner's to
    // trigger, once it holds the reference — see `setFromState`.
    this.readSize();
  }

  get view(): View {
    const w = this.width / this.scale;
    const h = this.height / this.scale;
    return { x: this.cx - w / 2, y: this.cy - h / 2, w, h, scale: this.scale };
  }

  setFromState(x: number, y: number, scale: number): void {
    this.cx = x;
    this.cy = y;
    this.scale = scale;
    this.emit(true);
  }

  private readSize(): void {
    const r = this.el.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
  }

  private measure(): void {
    this.readSize();
    this.emit(true);
  }

  /**
   * Scroll worlds pan freely in x but stay pinned in y, and their scale is
   * fixed so the band always fills the viewport — the composition is designed
   * for that framing and zooming out of it just shows the seams.
   */
  private clamp(): void {
    if (this.world.mode !== 'scroll') {
      this.scale = Math.min(Math.max(this.scale, this.world.initialScale * 0.5), this.world.initialScale * 4096);
      return;
    }
    const band = this.world.bandHeight ?? this.world.tileSize;
    this.scale = this.height / band;
    this.cy = band / 2;
  }

  private emit(settled: boolean): void {
    this.clamp();
    this.onChange(this.view, settled);
    if (!settled) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => this.onChange(this.view, true), 120);
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.pinchDist = this.spread();
      this.pinchScale = this.scale;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, next);

    if (this.pointers.size >= 2) {
      const d = this.spread();
      if (this.pinchDist > 0 && this.world.mode === 'zoom') {
        this.scale = this.pinchScale * (d / this.pinchDist);
      }
      this.emit(false);
      return;
    }

    this.cx -= (next.x - prev.x) / this.scale;
    if (this.world.mode === 'zoom') {
      this.cy -= (next.y - prev.y) / this.scale;
    }
    this.emit(false);
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    this.emit(true);
  };

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.world.mode === 'scroll') {
      // A trackpad's dominant axis differs by device; take whichever is larger
      // so both a horizontal swipe and a vertical scroll move the scroll world.
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.cx += d / this.scale;
      this.emit(false);
      return;
    }
    // Zoom about the cursor, so the point under the pointer stays put.
    const rect = this.el.getBoundingClientRect();
    const px = e.clientX - rect.left - this.width / 2;
    const py = e.clientY - rect.top - this.height / 2;
    const before = { x: this.cx + px / this.scale, y: this.cy + py / this.scale };
    this.scale *= Math.exp(-e.deltaY * 0.0015);
    this.clamp();
    this.cx = before.x - px / this.scale;
    this.cy = before.y - py / this.scale;
    this.emit(false);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const step = 120 / this.scale;
    switch (e.key) {
      case 'ArrowLeft':
        this.cx -= step;
        break;
      case 'ArrowRight':
        this.cx += step;
        break;
      case 'ArrowUp':
        if (this.world.mode === 'zoom') this.cy -= step;
        break;
      case 'ArrowDown':
        if (this.world.mode === 'zoom') this.cy += step;
        break;
      case '+':
      case '=':
        if (this.world.mode === 'zoom') this.scale *= 1.3;
        break;
      case '-':
        if (this.world.mode === 'zoom') this.scale /= 1.3;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.emit(true);
  };

  destroy(): void {
    this.ro.disconnect();
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerUp);
    this.el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.clearTimeout(this.settleTimer);
  }
}
