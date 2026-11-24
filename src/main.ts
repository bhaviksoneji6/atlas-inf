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
      worlds,
      repoUrl: REPO_URL,
      currentWorld: () => this.state.world,
      currentSeed: () => this.state.seed,
      currentDetail: () => this.state.detail ?? 1,
      onWorld: (id) => this.setWorld(id),
      onSeed: (seed) => this.setSeed(seed),
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
    document.body.style.background = this.world.background;

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
      this.draw(view, settled);
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

  private draw(view: View, settled: boolean): void {
    const seed = hashString(this.state.seed);
    const noise = makeNoise(seed);
    // Drop detail while a gesture is in flight, restore it once it settles —
    // the cheapest way to keep panning responsive on a phone.
    const detail = (this.state.detail ?? 1) * (settled ? 1 : 0.6);

    const tiles = visibleTiles(view, this.world);
    const geometry: Polyline[] = [];
    let generated = 0;

    for (const tile of tiles) {
      const key = `${this.state.seed}/${this.world.id}/${tile.key}/${detail.toFixed(2)}`;
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
    this.renderer.frame(view, geometry, this.world.background);

    this.shell.setStatus(
      generated > 0 ? `${this.world.name} · ${geometry.length.toLocaleString()} paths` : '',
    );
  }

  private setWorld(id: string): void {
    if (id === this.state.world) return;
    this.world = worldById(id);
    this.state.world = id;
    this.state.x = 0;
    this.state.y = 0;
    this.state.z = 0;
    this.cache.clear();
    this.mountWorld();
    writeState(this.state, true);
  }

  private setSeed(seed: string): void {
    const next = seed || randomSeed();
    if (next === this.state.seed) return;
    this.state.seed = next;
    this.cache.clear();
    writeState(this.state, true);
    this.draw(this.lastView, true);
  }

  private setDetail(detail: number): void {
    this.state.detail = detail;
    this.cache.clear();
    writeState(this.state);
    this.draw(this.lastView, true);
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
