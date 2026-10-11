/**
 * The URL hash is the only state.
 *
 * `#world=topo&seed=184728&x=18420&y=0&z=2.5`
 *
 * This is worth the discipline for three reasons: every view is shareable, the
 * browser's back button works for free, and it forces the generator to stay
 * spatially deterministic — a pasted link has to reconstruct the view with no
 * history of how someone got there.
 */

export interface AtlasState {
  world: string;
  seed: string;
  x: number;
  y: number;
  /** log2 of the scale multiple over the world's initial scale. */
  z: number;
  detail?: number;
}

function num(v: string | null, fallback: number): number {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readState(fallback: AtlasState): AtlasState {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  return {
    world: p.get('world') || fallback.world,
    seed: p.get('seed') || fallback.seed,
    x: num(p.get('x'), fallback.x),
    y: num(p.get('y'), fallback.y),
    z: num(p.get('z'), fallback.z),
    detail: p.has('detail') ? num(p.get('detail'), 1) : undefined,
  };
}

export function writeState(s: AtlasState, push = false): void {
  const p = new URLSearchParams();
  p.set('world', s.world);
  p.set('seed', s.seed);
  p.set('x', s.x.toFixed(1));
  p.set('y', s.y.toFixed(1));
  p.set('z', s.z.toFixed(3));
  if (s.detail !== undefined && s.detail !== 1) p.set('detail', s.detail.toFixed(2));
  const hash = '#' + p.toString();
  if (push) {
    history.pushState(null, '', hash);
  } else {
    history.replaceState(null, '', hash);
  }
}

export function randomSeed(): string {
  return Math.floor(Math.random() * 1e9).toString(36);
}
