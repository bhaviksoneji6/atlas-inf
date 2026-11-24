# Notice and attribution

`atlas-inf` is licensed under the MIT License, Copyright (c) 2026 Bhavik Soneji.
See [LICENSE](LICENSE).

## Derived from shan-shui-inf

This project began as a study of **[shan-shui-inf](https://github.com/LingDong-/shan-shui-inf)**
by **Lingdong Huang**, which is distributed under the MIT License,
Copyright (c) 2018 Lingdong Huang.

The upstream project is vendored unmodified at
[`vendor/shan-shui-inf/`](vendor/shan-shui-inf/) together with its original
licence text, so the terms travel with the code they cover.

### What is ported

Substantially more than when this file was first written. The Shan Shui world
is a port of upstream's drawing code, not merely inspired by it.

**Drawing primitives** — [`src/engine/brush.ts`](src/engine/brush.ts):

| atlas-inf   | upstream             |
| ----------- | -------------------- |
| `poly`      | `poly` (line 485)    |
| `stroke`    | `stroke` (line 516)  |
| `blob`      | `blob` (line 578)    |
| `div`       | `div` (line 627)     |
| `texture`   | `texture` (line 653) |
| `bezmh`     | `bezmh` (line 445)   |
| `loopNoise` | `loopNoise` (line 404) |

**Helpers** — [`src/engine/math.ts`](src/engine/math.ts) (`mapval`, `distance`,
`wtrand`, `randGaussian`, lines 395-443) and
[`src/engine/poly-tools.ts`](src/engine/poly-tools.ts) (`midPt`, `triangulate`,
lines 207-382).

**The Shan Shui world** — [`src/worlds/shanshui/`](src/worlds/shanshui/):

| atlas-inf          | upstream                        |
| ------------------ | ------------------------------- |
| `tree.ts`          | `Tree`, all eight generators plus the shared `branch` / `twig` / `barkify` (lines 743-1725) |
| `mount.ts`         | `Mount` — `foot`, `mountain`, `flatMount`, `flatDec`, `distMount`, `rock` (lines 1727-2523) |
| `water.ts`         | `water` (lines 3667-3704)       |
| `planner.ts`       | `mountplanner` (lines 3706-3814) |

The paper texture in [`src/main.ts`](src/main.ts) reproduces upstream's
background canvas (lines 4336-4360), and the page chrome in
[`src/ui/shell.ts`](src/ui/shell.ts) follows its layout: a ☰ menu box, a `</>`
source box, `<pre>`-labelled controls and the flanking 〈 〉 arrows.

`Arch` (houses, pagodas, boats, transmission towers) and `Man` are **not yet
ported**. `Mount` calls into `Arch` in five places; those go through an
optional hook in `mount.ts`, so the mountains currently carry no buildings.

### What is original

The engine: coordinate-seeded randomness, the noise field, the tile cache and
strip/quadtree indexes, the viewport, the renderers and the typed geometry
model. Also the two parked worlds, Topography and Ink Ridges, and the
decisions listed under *Other things that changed* below.

### What is deliberately **not** carried over

The upstream `PerlinNoise` block is copied from
[p5.js](https://github.com/processing/p5.js/blob/main/src/math/noise.js), as a
comment on line 89 of upstream's `index.html` records. **p5.js is licensed
under LGPL-2.1**, which is not the same as the MIT licence on the rest of the
upstream repository.

Rather than carry code under terms we would then have to honour separately,
[`src/engine/noise.ts`](src/engine/noise.ts) is an independent implementation of
hash-based value noise and fBm, written for this project. It is also a better
fit technically: it holds no module-global state, it is a pure function of
`(seed, x, y)`, and it exposes per-call octave control, which the zoom worlds
need for detail amplification.

The result is that **no LGPL code is present in this repository** and the
entire tree is MIT.

### Other things that changed in porting

- ES5 globals and `new function() {}` namespaces → ES modules.
- The global `Math.random` override → an injected, coordinate-seeded RNG.
- Concatenated SVG strings → typed geometry (`Polyline[]`), which is what makes
  one world renderable to both SVG and canvas, and what makes SVG export free.
- Sequential determinism → spatial determinism, so a view can be reconstructed
  from a URL without replaying the generation order that produced it.
