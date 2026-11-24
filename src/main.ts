import './style.css';

import { makeBrush } from './engine/brush';
import { makeNoise } from './engine/noise';
import { hashString, rngAt } from './engine/rng';
import { TileCache, visibleTiles } from './engine/tiles';
import { CanvasRenderer } from './engine/render/canvas';
import { SvgRenderer, toSvgDocument } from './engine/render/svg';
import { readState, writeState, randomSeed, type AtlasState } from './engine/url-state';
import { Viewport } from './engine/viewport';
import type { Polyline, Renderer, View, World } from './engine/types';
import { createShell, type Shell } from './ui/shell';
import { worldById, worlds } from './worlds';

const REPO_URL = 'https://github.com/bhaviksoneji6/atlas-inf';

/**
 * Detail defaults from viewport width rather than user-agent sniffing: a narrow
 * window on a laptop has the same problem a phone does, and a phone in
 * landscape has less of one.
 */
function defaultDetail(): number {
  return window.innerWidth < 700 ? 0.5 : 1;
}

/**
 * Upstream's paper: a 512px tile of warm noise, mirrored into quadrants so it
 * repeats seamlessly, painted behind everything. Flat colour reads as a web
 * page; this reads as paper, and it is most of why the original looks like a
 * painting rather than a diagram.
 *
 * Reproduced from vendor/shan-shui-inf/index.html lines 4336-4360.
 */
function paperTexture(): string | null {
  try {
    return buildPaper();
  } catch {
    // Paper is decoration. A blocked canvas — privacy mode, a locked-down
    // browser, a headless DOM — must cost the texture and nothing else. This
    // threw inside the constructor once and took the whole page down with it,
    // which is the same failure mode as the original start-up crash.
    return null;
  }
}

function buildPaper(): string | null {
  const reso = 512;
  const canvas = document.createElement('canvas');
  canvas.width = reso;
  canvas.height = reso;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(reso, reso);
  if (!img?.data) return null;
  const noise = makeNoise(0x5a11a1);
  const put = (x: number, y: number, r: number, g: number, b: number): void => {
    const i = (y * reso + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };

  for (let i = 0; i <= reso / 2; i++) {
    for (let j = 0; j <= reso / 2; j++) {
      let c = 245 + noise.noise2(i * 0.1, j * 0.1) * 10;
      c -= Math.random() * 20;
      const r = c;
      const g = c * 0.95;
      const b = c * 0.85;
      // Mirror into all four quadrants so the tile has no visible seam.
      put(i, j, r, g, b);
      put(Math.min(reso - 1, reso - i), j, r, g, b);
      put(i, Math.min(reso - 1, reso - j), r, g, b);
      put(Math.min(reso - 1, reso - i), Math.min(reso - 1, reso - j), r, g, b);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class Atlas {
  private state: AtlasState;
  private world: World;
  private renderer!: Renderer;
  private viewport!: Viewport;
  private cache = new TileCache<Polyline[]>(192);
  private shell: Shell;
  private stage: HTMLElement;
  private lastGeometry: Polyline[] = [];
  private lastView: View = { x: 0, y: 0, w: 1, h: 1, scale: 1 };
  private frameHandle = 0;
  private suppressHash = false;
  /** World units an arrow press walks, as upstream's INC_STEP. */
  private step = 200;
  private glideHandle = 0;
  private paper: string | null = null;
  private autoHandle = 0;

  constructor(private root: HTMLElement) {
    const fallback: AtlasState = {
      world: worlds[0]!.id,
      seed: randomSeed(),
      x: 0,
      y: 0,
      z: 0,
      detail: defaultDetail(),
    };
    this.state = readState(fallback);
    this.state.detail ??= defaultDetail();
    this.world = worldById(this.state.world);

    this.stage = document.createElement('div');
    this.stage.className = 'stage-host';
    this.root.append(this.stage);

    this.shell = createShell(this.root, {
      repoUrl: REPO_URL,
      currentSeed: () => this.state.seed,
      currentStep: () => this.step,
      currentDetail: () => this.state.detail ?? 1,
      onSeed: (seed) => this.setSeed(seed),
      onStep: (delta) => this.glideBy(delta),
      onStepSize: (size) => (this.step = size),
      onAutoScroll: (on) => this.setAutoScroll(on),
      onDetail: (detail) => this.setDetail(detail),
      onExportSvg: () => this.exportSvg(),
      onExportPng: () => void this.exportPng(),
    });

    this.mountWorld();
    writeState(this.state);

    window.addEventListener('hashchange', () => {
      if (this.suppressHash) return;
      const next = readState(this.state);
      if (next.world !== this.state.world || next.seed !== this.state.seed) {
        this.state = next;
        this.world = worldById(next.world);
        this.cache.clear();
        this.mountWorld();
        this.shell.refresh();
      } else {
        this.state = next;
        this.viewport.setFromState(next.x, next.y, this.scaleFromZ(next.z));
      }
    });
  }

  private scaleFromZ(z: number): number {
    return this.world.initialScale * 2 ** z;
  }

  private zFromScale(scale: number): number {
    return Math.log2(scale / this.world.initialScale);
  }

  private mountWorld(): void {
    this.renderer?.destroy();
    this.viewport?.destroy();
    this.stage.innerHTML = '';

    this.renderer =
      this.world.renderer === 'canvas' ? new CanvasRenderer() : new SvgRenderer();
    this.stage.append(this.renderer.el);

    this.stage.style.backgroundColor = this.world.background;
    document.body.style.backgroundColor = this.world.background;
    // Generated once and reused; the SVG surface is transparent so it shows.
    this.paper ??= paperTexture();
    if (this.paper && this.world.renderer === 'svg') {
      this.stage.style.backgroundImage = `url(${this.paper})`;
    } else {
      this.stage.style.backgroundImage = '';
    }

    this.viewport = new Viewport({
      el: this.stage,
      world: this.world,
      onChange: (view, settled) => this.onView(view, settled),
    });
    this.viewport.setFromState(this.state.x, this.state.y, this.scaleFromZ(this.state.z));
  }

  private onView(view: View, settled: boolean): void {
    this.lastView = view;
    // Everything here comes off `view`, never off `this.viewport`. The view
    // already carries its own pixel size (w * scale) and centre, and reaching
    // back through the field made this method depend on the viewport
    // reference being assigned — which is exactly what crashed the app on
    // start-up, since the first emit arrived mid-assignment.
    this.renderer.resize(view.w * view.scale, view.h * view.scale);

    // Coalesce to one render per frame: pointermove fires far more often.
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = 0;
      this.draw(view);
    });

    if (settled) {
      this.state.x = view.x + view.w / 2;
      this.state.y = view.y + view.h / 2;
      this.state.z = this.zFromScale(view.scale);
      this.suppressHash = true;
      writeState(this.state);
      // Let the hashchange this provoked pass before listening again.
      setTimeout(() => (this.suppressHash = false), 0);
    }
  }

  private draw(view: View): void {
    const seed = hashString(this.state.seed);
    const noise = makeNoise(seed);
    // Detail comes from settings alone. It used to drop to 0.6 mid-gesture,
    // which was a reasonable idea before tiles were cached and a bad one
    // after: the detail is part of the cache key, so every pan re-generated
    // every visible tile at a second resolution and then threw it away.
    const detail = this.state.detail ?? 1;

    const tiles = visibleTiles(view, this.world);
    const geometry: Polyline[] = [];
    const keys: string[] = [];
    let generated = 0;

    for (const tile of tiles) {
      const key = `${this.state.seed}/${this.world.id}/${tile.key}/${detail.toFixed(2)}`;
      keys.push(key);
      const geo = this.cache.get(key, () => {
        generated++;
        const brushRng = rngAt(seed, tile.x, tile.y, tile.level);
        return this.world.generate({
          seed,
          x: tile.x,
          y: tile.y,
          w: tile.w,
          h: tile.h,
          level: tile.level,
          detail,
          noise,
          brush: makeBrush(brushRng, noise),
          rngAt: (x, y) => rngAt(seed, x, y, tile.level),
        });
      });
      geometry.push(...geo);
    }

    this.lastGeometry = geometry;
    // The set of tiles on screen *is* the identity of the geometry, so a pan
    // that does not cross a tile boundary need not rebuild anything.
    this.renderer.frame(view, geometry, this.world.background, keys.join('|'));

    this.shell.setStatus(
      generated > 0 ? `${this.world.name} · ${geometry.length.toLocaleString()} paths` : '',
    );
  }

  /**
   * Walk the scroll by `delta`, eased.
   *
   * Upstream's arrow jumps instantly; gliding reads better and costs nothing,
   * because panning within a tile set no longer re-serialises anything. The
   * seed is untouched — the arrow moves along the same infinite world rather
   * than generating a new one.
   */
  private glideBy(delta: number): void {
    this.setAutoScroll(false);
    this.shell.clearAutoScroll();
    cancelAnimationFrame(this.glideHandle);

    const from = this.viewport.cx;
    const to = from + delta;
    const ms = 420;
    const t0 = performance.now();
    const ease = (t: number): number =>
      t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

    const tick = (now: number): void => {
      const t = Math.min(1, (now - t0) / ms);
      this.viewport.setCenter(from + (to - from) * ease(t), this.viewport.cy, t >= 1);
      if (t < 1) this.glideHandle = requestAnimationFrame(tick);
    };
    this.glideHandle = requestAnimationFrame(tick);
  }

  /** Upstream's auto-scroll checkbox: drift rightwards until told to stop. */
  private setAutoScroll(on: boolean): void {
    cancelAnimationFrame(this.autoHandle);
    this.autoHandle = 0;
    if (!on) {
      // Commit the position we drifted to.
      this.viewport.setCenter(this.viewport.cx, this.viewport.cy, true);
      return;
    }

    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      // Tied to the step size, so the one control governs both speed and jump.
      this.viewport.setCenter(this.viewport.cx + this.step * dt * 0.5, this.viewport.cy, false);
      this.autoHandle = requestAnimationFrame(tick);
    };
    this.autoHandle = requestAnimationFrame(tick);
  }

  private setSeed(seed: string): void {
    const next = seed || randomSeed();
    if (next === this.state.seed) return;
    this.state.seed = next;
    this.cache.clear();
    writeState(this.state, true);
    this.draw(this.lastView);
  }

  private setDetail(detail: number): void {
    this.state.detail = detail;
    this.cache.clear();
    writeState(this.state);
    this.draw(this.lastView);
  }

  private exportSvg(): void {
    const svg = toSvgDocument(this.lastView, this.lastGeometry, this.world.background);
    download(
      `atlas-inf-${this.world.id}-${this.state.seed}.svg`,
      new Blob([svg], { type: 'image/svg+xml' }),
    );
  }

  private async exportPng(): Promise<void> {
    if (this.renderer instanceof CanvasRenderer) {
      const blob = await this.renderer.toPngBlob();
      if (blob) download(`atlas-inf-${this.world.id}-${this.state.seed}.png`, blob);
      return;
    }
    // SVG world: rasterise the same geometry through an offscreen canvas rather
    // than screenshotting the DOM.
    const svg = toSvgDocument(this.lastView, this.lastGeometry, this.world.background);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(this.lastView.w * scale);
      canvas.height = Math.round(this.lastView.h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob) download(`atlas-inf-${this.world.id}-${this.state.seed}.png`, blob);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const root = document.getElementById('app');
if (root) new Atlas(root);
