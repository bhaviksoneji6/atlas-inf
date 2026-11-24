/**
 * Boot smoke test.
 *
 * The first deploy shipped a page that threw during start-up and rendered
 * nothing, while the typecheck, the build and the deploy all passed — because
 * none of them ever runs the app. This does: it bundles the real entry point,
 * boots it against a headless DOM, and asserts that it actually draws.
 *
 * It is not a rendering test. jsdom has no pixels, so this proves the app runs
 * and issues the right drawing calls, not that the result looks correct. That
 * still needs eyes on a browser.
 *
 *   node scripts/smoke.mjs
 *
 * If dist/ exists it is checked too, so CI exercises the artifact that ships
 * rather than only a re-bundle of the same source.
 */

import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const WIDTH = 1200;
const HEIGHT = 800;
/** Long enough for the rAF-scheduled first draw to land. */
const SETTLE_MS = 400;

/** Bundle the real entry point to something a DOM can evaluate. */
async function bundleSource() {
  const result = await build({
    entryPoints: [join(root, 'src/main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    logLevel: 'error',
    // The DOM harness has no stylesheet support and does not need one.
    loader: { '.css': 'empty' },
  });
  return result.outputFiles[0].text;
}

/** The built bundle, as actually deployed. */
function readDistBundle() {
  const assets = join(root, 'dist/assets');
  if (!existsSync(assets)) return null;
  const js = readdirSync(assets).find((f) => f.endsWith('.js'));
  if (!js) return null;
  // Vite emits an ES module; strip the empty export marker so it can be
  // evaluated as a classic script. Anything more than that and this check
  // should be reworked rather than patched.
  return readFileSync(join(assets, js), 'utf8').replace(/export\s*\{\s*\}\s*;?\s*$/, '');
}

/**
 * Run the app in a headless DOM and report what it did.
 * Returns the observations; asserting on them is the caller's job.
 */
async function boot(bundle, hash = '') {
  const errors = [];
  const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: `https://example.test/atlas-inf/${hash}`,
  });
  const { window } = dom;

  window.addEventListener('error', (e) => errors.push(`window error: ${e.message}`));

  // --- the handful of things jsdom does not implement -------------------
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.devicePixelRatio = 2;
  window.HTMLElement.prototype.setPointerCapture = function () {};
  window.HTMLElement.prototype.releasePointerCapture = function () {};
  window.Element.prototype.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: WIDTH, bottom: HEIGHT, width: WIDTH, height: HEIGHT,
  });

  // Count canvas calls, since a canvas world leaves no DOM evidence at all.
  const calls = { moveTo: 0, lineTo: 0, stroke: 0, fill: 0, fillRect: 0 };
  window.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => (prop in calls ? () => void calls[prop]++ : () => {}),
        set: () => true,
      },
    );

  try {
    window.eval(bundle);
  } catch (err) {
    errors.push(`threw during boot: ${err?.stack?.split('\n')[0] ?? err}`);
  }
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  const app = window.document.getElementById('app');
  return {
    window,
    errors,
    calls,
    host: !!app.querySelector('.stage-host'),
    canvas: !!app.querySelector('canvas'),
    svgPaths: app.querySelectorAll('svg.stage path').length,
    buttons: app.querySelectorAll('.icon-btn').length,
    hash: () => window.location.hash,
  };
}

/** Did it put marks on the surface it chose? */
function drew(r) {
  return r.canvas ? r.calls.moveTo > 0 && (r.calls.stroke > 0 || r.calls.fill > 0) : r.svgPaths > 0;
}

/** A pointer drag, which jsdom will not synthesise for us. */
function drag(r, from, to) {
  const host = r.window.document.querySelector('.stage-host');
  for (const [type, pt] of [['pointerdown', from], ['pointermove', to], ['pointerup', to]]) {
    const ev = new r.window.MouseEvent(type, {
      clientX: pt[0], clientY: pt[1], bubbles: true, cancelable: true,
    });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    host.dispatchEvent(ev);
  }
}

// ---------------------------------------------------------------------------

const checks = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

const sourceBundle = await bundleSource();

console.log('\nsource bundle');

{
  const r = await boot(sourceBundle);
  record('default world boots without error', r.errors.length === 0, r.errors.join(' | '));
  record('mounts a stage and a renderer', r.host && r.canvas);
  record('renders the controls', r.buttons >= 3, `${r.buttons} buttons`);
  record('draws to canvas', drew(r), `moveTo=${r.calls.moveTo} stroke=${r.calls.stroke} fill=${r.calls.fill}`);
  record('writes its state to the URL', /world=/.test(r.hash()), r.hash());
}

{
  const r = await boot(sourceBundle, '#world=ridges&seed=atlas&x=0&y=400&z=0');
  record('scroll world boots without error', r.errors.length === 0, r.errors.join(' | '));
  record('scroll world renders to SVG', drew(r), `${r.svgPaths} paths`);
}

{
  const r = await boot(sourceBundle, '#world=topo&seed=atlas&x=3072&y=1024&z=3');
  record('deep zoom boots without error', r.errors.length === 0, r.errors.join(' | '));
  record('deep zoom still draws', drew(r), `moveTo=${r.calls.moveTo}`);
}

{
  const r = await boot(sourceBundle, '#world=topo&seed=atlas&x=0&y=0&z=0');
  const before = r.hash();
  drag(r, [900, 400], [300, 400]);
  await new Promise((res) => setTimeout(res, SETTLE_MS));
  record('a drag does not throw', r.errors.length === 0, r.errors.join(' | '));
  record('a drag moves the view', r.hash() !== before, `${before} -> ${r.hash()}`);
}

const dist = readDistBundle();
if (dist) {
  console.log('\nbuilt bundle (dist/)');
  const r = await boot(dist);
  record('shipped bundle boots without error', r.errors.length === 0, r.errors.join(' | '));
  record('shipped bundle draws', drew(r), `moveTo=${r.calls.moveTo}`);
} else {
  console.log('\nbuilt bundle (dist/) — not present, skipped. Run `npm run build` first.');
}

const failed = checks.filter((c) => !c.pass);
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed` +
    (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(', ')}` : ''),
);
process.exit(failed.length ? 1 : 0);
