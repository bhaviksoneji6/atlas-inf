# atlas-inf

**→ [bhaviksoneji6.github.io/atlas-inf](https://bhaviksoneji6.github.io/atlas-inf/)**

An atlas of infinite, deterministic procedural worlds, generated in the
browser. Every view is a pure function of a seed and a coordinate, so a URL is
enough to reconstruct exactly what someone else was looking at.

> **Status: early.** Two worlds, and the art direction is a long way behind
> the engine. See [Known rough edges](#known-rough-edges).

Inspired by, and partly derived from,
[shan-shui-inf](https://github.com/LingDong-/shan-shui-inf) by Lingdong Huang.
See [NOTICE.md](NOTICE.md) for exactly what is ported and what is not.

## Worlds

| World | Mode | Renderer | |
| --- | --- | --- | --- |
| **Topography** | zoom | canvas | An endless contour map. Zooming adds fBm octaves that were previously sub-pixel and halves the contour interval, so detail *appears* rather than magnifies. Peaks and rivers live on a fixed world lattice, so they stay put across zoom levels. |
| **Ink Ridges** | scroll | SVG | Receding ridgelines in ink wash, scrolling sideways forever. Uses the ported brush primitives for what they were designed for. |

## How it works

```
seed ──► hash ──► coordinate-seeded RNG ──┐
                                          ├──► world planner ──► typed geometry ──► renderer
         fBm / ridged noise field ────────┘       (per world)      (Polyline[])     (svg | canvas)
                         ▲
                    tile cache  ◄── strip (scroll) or quadtree (zoom)
```

Four pieces are shared by every world — a hash-based RNG, a noise field, a tile
cache and a renderer. What differs per world is the **planner** (what features
exist and where they go) and the **drawing grammar** (how a feature becomes
geometry). Adding a world means adding those two things and one line in
[`src/worlds/index.ts`](src/worlds/index.ts).

Three decisions carry most of the weight:

**Randomness is spatial, not sequential.** Upstream replaces the global
`Math.random` with one seeded stream, so its worlds are reproducible only if
you traverse them in the same order. That is invisible along one axis and fatal
once a world can be zoomed or linked to. Here every feature derives its
randomness from its own coordinates, so any tile at any level generates in
isolation and a pasted URL reconstructs the view with no history.

**Geometry stays typed until the renderer.** Worlds emit `Polyline[]`, not SVG
strings. That is what lets one world render to SVG *or* canvas, and what makes
"download as SVG" work even for the canvas worlds.

**Tiles sample a global lattice.** Neighbouring tiles share their edge samples
exactly, so a contour leaving one tile arrives at the identical point in the
next. No stitching pass, no seams.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the built output
```

## Deploying to GitHub Pages

Live at **https://bhaviksoneji6.github.io/atlas-inf/**.

Pushing to `main` builds and deploys via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). One manual step
first, once per repository:

**Settings → Pages → Build and deployment → Source: _GitHub Actions_.**

Without that the workflow runs and the deploy step fails. Two things differ
from a Vercel-style deploy and are already handled:

- A project site is served from `/atlas-inf/`, not `/`, so
  [`vite.config.ts`](vite.config.ts) sets `base` for builds only — `vite dev`
  still serves from `/`.
- There is no SPA rewrite. All state lives in the URL *hash*, which never
  reaches the server, so this does not matter here. It would if routes ever
  moved into the path.

## Controls

| | |
| --- | --- |
| Drag / swipe | Pan |
| Wheel / pinch | Zoom (zoom worlds only) |
| Arrow keys | Pan; `+` / `-` zoom |
| Esc | Close a panel |

Three buttons, top left: change world, settings, source. Seed, position and
zoom live in the URL, so any view worth keeping is a link.

## Known rough edges

- **There is no boot test.** The first deploy shipped a page that threw
  during start-up and rendered nothing, while the typecheck, the build and
  the deploy all passed — none of them ever runs the app. Loading the bundle
  into a headless DOM and asserting that it draws would close the gap.
- Rivers stop at the first closed basin above the water line rather than
  filling it and spilling onward. Correct for a noise field, but real
  hydrology would carve through.
- A river crossing several tiles is generated once per tile it touches. The
  geometry is identical each time, so it looks right, but it is wasted work.
- Ink Ridges has no mid-ground interest yet — ridges, trees, and nothing
  between.
- No labels anywhere. The topographic world wants elevation figures on its
  index contours, which needs text in the geometry model.

## Licence

MIT, © 2026 Bhavik Soneji. Portions adapted from `shan-shui-inf`, MIT, © 2018
Lingdong Huang — see [NOTICE.md](NOTICE.md).
