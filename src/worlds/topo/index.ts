/**
 * Infinite topographic world — zoom, canvas.
 *
 * The planner technique is the one from upstream's `mountplanner` (sample a
 * field, keep its local maxima as feature sites, reject sites within a minimum
 * distance of an existing one), applied to an elevation field instead of a
 * mountain-density one. The elevation field, contouring and hydrology are
 * original.
 *
 * Zoom behaves as detail amplification, not magnification: `level` adds fBm
 * octaves that were previously sub-pixel and halves the contour interval, so
 * zooming in reveals terrain that was always implied rather than stretching
 * what was already drawn.
 */

import type { GenContext, Polyline, Pt, World } from '../../engine/types';
import type { Noise } from '../../engine/noise';
import { contourLines, gridRange, isoFill, sampleGrid, smooth } from './contour';

/** World units per unit of noise space — the size of the landforms. */
const TERRAIN_SCALE = 1 / 1400;
const WATER_LEVEL = 0.4;
const BASE_INTERVAL = 0.035;
/** Every Nth contour is an index contour, drawn heavier. */
const INDEX_EVERY = 5;

/**
 * Hydrology is computed at a fixed octave count and on a fixed world lattice,
 * deliberately decoupled from the zoom level. Peaks and rivers are features of
 * the world, not of the view; if they were level-dependent they would rewrite
 * themselves under the cursor as you zoomed.
 */
const FEATURE_OCTAVES = 6;
/**
 * Thresholds are set against the measured distribution of the feature-octave
 * field, which runs about [0.20, 0.73] with a median near 0.46 — not against
 * the [0, 1] the field nominally spans. Picked out of the air, 0.72 sat at the
 * 99.97th percentile and no peak was ever marked.
 */
const SOURCE_MIN = 0.52;
const PEAK_MIN = 0.62;
const SOURCE_SPACING = 300;
const RIVER_STEP = 11;
const RIVER_STEPS = 150;
/** Rivers follow the valley, not the gravel: descend the low octaves only. */
const HYDRO_OCTAVES = 3.5;
const MOMENTUM = 0.6;
/** Anything shorter than this is a sliver, not a river. */
const RIVER_MIN_POINTS = 10;
/** How far a river can reach, so tiles know which off-tile sources matter. */
const RIVER_REACH = RIVER_STEP * RIVER_STEPS;

const INK = 'rgba(42,52,58,';
const WATER_FILL = 'rgba(126,166,186,0.34)';
const WATER_EDGE = 'rgba(70,112,136,0.8)';
const RIVER = 'rgba(70,112,136,0.9)';

/**
 * Elevation in [0, 1]. A pure function of (seed, x, y) — no state, no
 * generation order — so any tile at any level is independently reproducible.
 *
 * Mixing fBm with a ridged variant is what stops it reading as smooth blobs:
 * fBm gives the broad basins, ridged gives the sharp crests that make a
 * contour map legible as mountains.
 */
export function elevation(noise: Noise, x: number, y: number, octaves: number): number {
  const nx = x * TERRAIN_SCALE;
  const ny = y * TERRAIN_SCALE;

  // Mild domain warp: bends the ridgelines so they meander instead of running
  // in noise-aligned streaks.
  const wx = nx + 0.28 * (noise.noise2(nx * 0.5 + 11.3, ny * 0.5) - 0.5);
  const wy = ny + 0.28 * (noise.noise2(nx * 0.5, ny * 0.5 + 7.1) - 0.5);

  const base = noise.fbm(wx, wy, octaves);
  const crest = noise.ridged(wx * 1.7, wy * 1.7, Math.min(octaves, 6));
  return Math.min(1, Math.max(0, base * 0.68 + crest * 0.32));
}

function octavesFor(level: number): number {
  // Fractional, so the fade-in in `fbm` hides the level transition.
  return 4 + level * 0.9;
}

/**
 * The contour interval has to shrink with the tile, not with the zoom gesture.
 * A tile at level n covers 2^-n of the world, so the elevation range inside it
 * narrows by roughly the same factor; halving the interval every *other* level
 * leaves a deep zoom with almost no contours crossing it. Halving every level
 * keeps the number of lines per tile roughly constant, which is what makes the
 * zoom read as detail appearing rather than the map emptying out.
 */
function intervalFor(level: number): number {
  return BASE_INTERVAL / 2 ** level;
}

/**
 * Steepest descent with momentum, on a deliberately smooth field.
 *
 * Plain steepest descent on the full field does not work: at six octaves the
 * gradient is dominated by the highest-frequency term, so the walk drops into
 * the nearest few-metre dimple and stops after three steps. Rivers came out as
 * blue slivers.
 *
 * Two corrections. Descend the *low* octaves only, because a real river
 * follows the shape of the valley rather than every pebble in it. And carry
 * momentum, so the course keeps its heading across a flat instead of
 * oscillating between the banks.
 */
function river(noise: Noise, start: Pt, stepLen: number, maxSteps: number): Pt[] {
  const path: Pt[] = [start];
  let [x, y] = start;
  let dx = 0;
  let dy = 0;
  const h = stepLen * 0.75;

  // Lowest point reached, and where. A walk that stops descending has run into
  // a basin it cannot leave; with momentum it then orbits that basin until it
  // runs out of steps, which drew a tight knot of coils at the river's mouth.
  // Truncating back to the lowest point is both the fix and the correct
  // hydrology — that is where the water actually stops.
  let minH = elevation(noise, x, y, HYDRO_OCTAVES);
  let minIdx = 0;
  const STALL = 8;

  for (let i = 0; i < maxSteps; i++) {
    const gx =
      elevation(noise, x + h, y, HYDRO_OCTAVES) -
      elevation(noise, x - h, y, HYDRO_OCTAVES);
    const gy =
      elevation(noise, x, y + h, HYDRO_OCTAVES) -
      elevation(noise, x, y - h, HYDRO_OCTAVES);
    const mag = Math.hypot(gx, gy);
    if (mag < 1e-9) break;

    if (i === 0) {
      // Seed the heading straight downhill. Starting from rest, the momentum
      // term has nothing to damp and the walk orbits the summit instead of
      // leaving it — every river began with a little corkscrew.
      dx = -gx / mag;
      dy = -gy / mag;
    } else {
      dx = dx * MOMENTUM - (gx / mag) * (1 - MOMENTUM);
      dy = dy * MOMENTUM - (gy / mag) * (1 - MOMENTUM);
    }
    const dm = Math.hypot(dx, dy);
    if (dm < 1e-9) break;
    dx /= dm;
    dy /= dm;

    x += dx * stepLen;
    y += dy * stepLen;
    path.push([x, y]);

    const hz = elevation(noise, x, y, HYDRO_OCTAVES);
    if (hz < minH) {
      minH = hz;
      minIdx = path.length - 1;
    }
    if (hz < WATER_LEVEL) break;
    if (path.length - 1 - minIdx > STALL) break;
  }

  return path.slice(0, minIdx + 1);
}

export const topoWorld: World = {
  id: 'topo',
  name: 'Topography',
  blurb:
    'An endless contour map. Zoom in and finer terrain appears that was always implied by the field — then drop a transmitter on it.',
  mode: 'zoom',
  renderer: 'canvas',
  background: '#f4f1e8',
  ink: '#2a343a',
  tileSize: 2048,
  initialScale: 0.5,

  generate(ctx: GenContext): Polyline[] {
    const out: Polyline[] = [];
    const octaves = octavesFor(ctx.level);
    const interval = intervalFor(ctx.level);

    // Grid resolution: enough samples that a cell is a few pixels, scaled by
    // the detail setting so a phone can trade sharpness for frame rate.
    const res = Math.max(16, Math.round(64 * ctx.detail));
    const step = ctx.w / res;
    const field = (x: number, y: number): number => elevation(ctx.noise, x, y, octaves);

    // One extra cell of overlap, so a contour continues into the next tile
    // rather than stopping at the boundary.
    const grid = sampleGrid(ctx.x, ctx.y, step, res + 1, res + 1, field);

    // --- water -----------------------------------------------------------
    for (const poly of isoFill(grid, WATER_LEVEL)) {
      out.push({ pts: poly, fill: WATER_FILL, stroke: 'none', width: 0, z: 0 });
    }
    for (const line of contourLines(grid, WATER_LEVEL)) {
      out.push({ pts: line, fill: 'none', stroke: WATER_EDGE, width: 1.2 / ctx.w * 100, z: 1 });
    }

    // --- contours --------------------------------------------------------
    // Only the levels this tile actually spans, and never more than a sane
    // number of them: a tile holding a cliff must not cost hundreds of passes.
    const [gmin, gmax] = gridRange(grid);
    const k0 = Math.ceil(Math.max(gmin, WATER_LEVEL) / interval);
    const k1 = Math.floor(gmax / interval);
    const MAX_LINES = 48;
    const stride = Math.max(1, Math.ceil((k1 - k0) / MAX_LINES));

    for (let k = Math.ceil(k0 / stride) * stride; k <= k1; k += stride) {
      const isIndex = k % (INDEX_EVERY * stride) === 0;
      for (const line of contourLines(grid, k * interval)) {
        out.push({
          pts: smooth(line, 1),
          fill: 'none',
          stroke: INK + (isIndex ? '0.62)' : '0.34)'),
          width: (isIndex ? 1.6 : 0.9) * (step / 8),
          z: 2 + (isIndex ? 1 : 0),
        });
      }
    }

    // --- peaks and rivers ------------------------------------------------
    // Features live on a *world* lattice at fixed octaves, not on the tile
    // grid at the current level. That distinction is the whole point: a peak
    // has to be the same peak whatever zoom you look at it from, and a river
    // has to take the same course. Tying either to the tile made them vanish
    // at depth, because a deep tile spans too little terrain to contain a
    // local maximum of its own.
    const half = SOURCE_SPACING / 2;
    const i0 = Math.floor((ctx.x - RIVER_REACH) / SOURCE_SPACING);
    const i1 = Math.ceil((ctx.x + ctx.w + RIVER_REACH) / SOURCE_SPACING);
    const j0 = Math.floor((ctx.y - RIVER_REACH) / SOURCE_SPACING);
    const j1 = Math.ceil((ctx.y + ctx.h + RIVER_REACH) / SOURCE_SPACING);

    const inTile = (p: Pt): boolean =>
      p[0] >= ctx.x && p[0] <= ctx.x + ctx.w && p[1] >= ctx.y && p[1] <= ctx.y + ctx.h;

    // Ink weight has to track the tile's world size, or marks drawn at one
    // zoom are invisible at another.
    const unit = ctx.w / 64;

    for (let gi = i0; gi <= i1; gi++) {
      for (let gj = j0; gj <= j1; gj++) {
        const rng = ctx.rngAt(gi * SOURCE_SPACING, gj * SOURCE_SPACING);
        // Jitter off the lattice, so a field of peaks never reads as a grid.
        const sx = gi * SOURCE_SPACING + rng.range(-half, half) * 0.7;
        const sy = gj * SOURCE_SPACING + rng.range(-half, half) * 0.7;

        const h0 = elevation(ctx.noise, sx, sy, FEATURE_OCTAVES);
        if (h0 < SOURCE_MIN) continue;

        // Upstream's planner test, at world scale: keep only local maxima.
        let isMax = true;
        for (let a = 0; a < 8 && isMax; a++) {
          const t = (a / 8) * Math.PI * 2;
          const px = sx + Math.cos(t) * half;
          const py = sy + Math.sin(t) * half;
          if (elevation(ctx.noise, px, py, FEATURE_OCTAVES) > h0) isMax = false;
        }
        if (!isMax) continue;

        // Peak mark, only when the peak itself is in this tile. Sized in
        // fractions of a grid cell: a survey mark is a small annotation, and
        // at unit * 1.6 these came out as enormous Xs stamped over the map.
        if (h0 > PEAK_MIN && inTile([sx, sy])) {
          const r = unit * 0.34;
          const w = unit * 0.075;
          out.push(
            { pts: [[sx - r, sy - r], [sx + r, sy + r]], stroke: INK + '0.85)', width: w, z: 7 },
            { pts: [[sx - r, sy + r], [sx + r, sy - r]], stroke: INK + '0.85)', width: w, z: 7 },
          );
        }

        // Rivers, traced on the fixed hydrology field so a course is a stable
        // world feature rather than something that rewrites itself as you zoom.
        const branches = 1 + rng.int(2);
        for (let b = 0; b < branches; b++) {
          const path = river(
            ctx.noise,
            [sx + rng.range(-half, half) * 0.4, sy + rng.range(-half, half) * 0.4],
            RIVER_STEP,
            RIVER_STEPS,
          );
          if (path.length < RIVER_MIN_POINTS) continue;
          // Cheap reject: skip rivers that never touch this tile.
          if (!path.some(inTile)) continue;
          out.push(
            ctx.brush.stroke(ctx.brush.bezmh(path, 1), {
              col: RIVER,
              wid: unit * 0.16,
              noi: 0.4,
              out: 0,
              z: 6,
              // Rises from a trickle at the source to full width downstream.
              fun: (t) => Math.min(1, t * 2.2) ** 0.7,
            }),
          );
        }
      }
    }

    return out;
  },
};
