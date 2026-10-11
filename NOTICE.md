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

The ink-brush drawing primitives in [`src/engine/brush.ts`](src/engine/brush.ts)
are adapted closely from the corresponding functions in the upstream
`index.html`:

| atlas-inf        | upstream              |
| ---------------- | --------------------- |
| `poly`           | `poly` (line 485)     |
| `stroke`         | `stroke` (line 516)   |
| `blob`           | `blob` (line 578)     |
| `div`            | `div` (line 627)      |
| `texture`        | `texture` (line 653)  |
| `bezmh`          | `bezmh` (line 445)    |
| `loopNoise`      | `loopNoise` (line 404)|

The *technique* used by the world planners — sample a noise field, keep its
local maxima as feature sites, reject sites that fall within a minimum
distance of an existing one, and record occupancy so later passes fill the
gaps — is also taken from upstream's `mountplanner` (line 3706). The planners
themselves are original.

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
