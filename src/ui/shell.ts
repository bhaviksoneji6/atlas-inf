/**
 * The whole interface: three buttons in the top-left corner, and two panels
 * behind them.
 *
 * Deliberately this small. The artwork is the page; chrome that competes with
 * it is chrome that should not exist. The buttons are 44px targets inside the
 * safe-area inset, and the panels become full-height sheets on a narrow
 * viewport rather than floating popovers, because a popover on a phone is a
 * mis-tap waiting to happen.
 */

import type { World } from '../engine/types';

const ICONS = {
  world:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M4.5 7.8l2.2 1.3M17.3 14.9l2.2 1.3M4.5 16.2l2.2-1.3M17.3 9.1l2.2-1.3"/></svg>',
  repo:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1.3-4-2.2-5.5-2.8M15 21v-3.4c0-1 .1-1.4-.5-2 2.3-.3 4.5-1.2 4.5-5.2a4 4 0 0 0-1.1-2.8 3.7 3.7 0 0 0-.1-2.8s-1.2-.4-3.8 1.4a9.3 9.3 0 0 0-5 0C6.4 4.6 5.2 5 5.2 5a3.7 3.7 0 0 0-.1 2.8A4 4 0 0 0 4 10.6c0 4 2.2 4.9 4.5 5.2-.6.6-.6 1.2-.5 2V21"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

export interface ShellOptions {
  worlds: World[];
  repoUrl: string;
  currentWorld(): string;
  currentSeed(): string;
  currentDetail(): number;
  onWorld(id: string): void;
  onSeed(seed: string): void;
  onDetail(detail: number): void;
  onExportSvg(): void;
  onExportPng(): void;
}

export interface Shell {
  setStatus(text: string): void;
  refresh(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function createShell(root: HTMLElement, opts: ShellOptions): Shell {
  const controls = el('div', 'controls');
  const status = el('div', 'status');
  const scrim = el('div', 'scrim');

  // --- panels -------------------------------------------------------------
  const worldPanel = el('section', 'panel panel--worlds');
  const settingsPanel = el('section', 'panel panel--settings');

  const closePanels = (): void => {
    worldPanel.classList.remove('is-open');
    settingsPanel.classList.remove('is-open');
    scrim.classList.remove('is-open');
  };

  const openPanel = (panel: HTMLElement): void => {
    const already = panel.classList.contains('is-open');
    closePanels();
    if (already) return;
    panel.classList.add('is-open');
    scrim.classList.add('is-open');
  };

  scrim.addEventListener('click', closePanels);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanels();
  });

  // --- world picker -------------------------------------------------------
  const worldHeader = el('header', 'panel__head');
  worldHeader.append(el('h2', undefined, 'Choose a world'));
  const worldClose = el('button', 'icon-btn icon-btn--bare', ICONS.close);
  worldClose.setAttribute('aria-label', 'Close');
  worldClose.addEventListener('click', closePanels);
  worldHeader.append(worldClose);
  worldPanel.append(worldHeader);

  const grid = el('div', 'world-grid');
  for (const w of opts.worlds) {
    const card = el('button', 'world-card');
    card.dataset.world = w.id;
    card.innerHTML =
      `<span class="world-card__name">${w.name}</span>` +
      `<span class="world-card__meta">${w.mode === 'zoom' ? 'zoom' : 'scroll'} · ${w.renderer}</span>` +
      `<span class="world-card__blurb">${w.blurb}</span>`;
    card.addEventListener('click', () => {
      opts.onWorld(w.id);
      closePanels();
      refresh();
    });
    grid.append(card);
  }
  worldPanel.append(grid);

  // --- settings -----------------------------------------------------------
  const setHeader = el('header', 'panel__head');
  setHeader.append(el('h2', undefined, 'Settings'));
  const setClose = el('button', 'icon-btn icon-btn--bare', ICONS.close);
  setClose.setAttribute('aria-label', 'Close');
  setClose.addEventListener('click', closePanels);
  setHeader.append(setClose);
  settingsPanel.append(setHeader);

  const seedRow = el('div', 'field');
  seedRow.append(el('label', undefined, 'Seed'));
  const seedWrap = el('div', 'field__row');
  const seedInput = el('input', 'input');
  seedInput.type = 'text';
  seedInput.spellcheck = false;
  seedInput.addEventListener('change', () => opts.onSeed(seedInput.value.trim()));
  seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      opts.onSeed(seedInput.value.trim());
      seedInput.blur();
    }
  });
  const reroll = el('button', 'btn', 'Reroll');
  reroll.addEventListener('click', () => {
    opts.onSeed(Math.floor(Math.random() * 1e9).toString(36));
    refresh();
  });
  seedWrap.append(seedInput, reroll);
  seedRow.append(seedWrap);
  seedRow.append(
    el(
      'p',
      'hint',
      'The seed and your position live in the URL, so any view you like is a link you can share.',
    ),
  );
  settingsPanel.append(seedRow);

  const detailRow = el('div', 'field');
  const detailLabel = el('label', undefined, 'Detail');
  detailRow.append(detailLabel);
  const detail = el('input', 'range');
  detail.type = 'range';
  detail.min = '0.3';
  detail.max = '1';
  detail.step = '0.05';
  detail.addEventListener('input', () => {
    detailLabel.textContent = `Detail — ${Math.round(Number(detail.value) * 100)}%`;
    opts.onDetail(Number(detail.value));
  });
  detailRow.append(detail);
  detailRow.append(
    el(
      'p',
      'hint',
      'Defaults from your viewport width rather than sniffing for a phone. Lower it if panning stutters.',
    ),
  );
  settingsPanel.append(detailRow);

  const exportRow = el('div', 'field');
  exportRow.append(el('label', undefined, 'Export this view'));
  const exportWrap = el('div', 'field__row');
  const svgBtn = el('button', 'btn', 'SVG');
  svgBtn.addEventListener('click', opts.onExportSvg);
  const pngBtn = el('button', 'btn', 'PNG');
  pngBtn.addEventListener('click', opts.onExportPng);
  exportWrap.append(svgBtn, pngBtn);
  exportRow.append(exportWrap);
  exportRow.append(
    el('p', 'hint', 'Geometry stays typed all the way to the renderer, so SVG export works even for the canvas worlds.'),
  );
  settingsPanel.append(exportRow);

  const about = el('div', 'about');
  about.innerHTML =
    `<h3>About</h3>` +
    `<p>An atlas of infinite, deterministic procedural worlds. Every view is a pure function of its seed and coordinates.</p>` +
    `<p>The ink-brush drawing primitives are adapted from ` +
    `<a href="https://github.com/LingDong-/shan-shui-inf" target="_blank" rel="noopener noreferrer">shan-shui-inf</a> ` +
    `by Lingdong Huang (MIT, © 2018), as is the feature-placement technique. ` +
    `Everything else is original. See ` +
    `<a href="${opts.repoUrl}/blob/main/NOTICE.md" target="_blank" rel="noopener noreferrer">NOTICE.md</a>.</p>` +
    `<p class="about__by">atlas-inf · MIT · Bhavik Soneji</p>`;
  settingsPanel.append(about);

  // --- buttons ------------------------------------------------------------
  const worldBtn = el('button', 'icon-btn', ICONS.world);
  worldBtn.setAttribute('aria-label', 'Change world');
  worldBtn.addEventListener('click', () => openPanel(worldPanel));

  const settingsBtn = el('button', 'icon-btn', ICONS.settings);
  settingsBtn.setAttribute('aria-label', 'Settings');
  settingsBtn.addEventListener('click', () => openPanel(settingsPanel));

  const repoLink = el('a', 'icon-btn', ICONS.repo);
  repoLink.href = opts.repoUrl;
  repoLink.target = '_blank';
  repoLink.rel = 'noopener noreferrer';
  repoLink.setAttribute('aria-label', 'Source on GitHub');

  controls.append(worldBtn, settingsBtn, repoLink);
  root.append(controls, status, scrim, worldPanel, settingsPanel);

  function refresh(): void {
    const id = opts.currentWorld();
    seedInput.value = opts.currentSeed();
    detail.value = String(opts.currentDetail());
    detailLabel.textContent = `Detail — ${Math.round(opts.currentDetail() * 100)}%`;
    for (const card of grid.querySelectorAll<HTMLElement>('.world-card')) {
      card.classList.toggle('is-current', card.dataset.world === id);
    }
  }

  refresh();

  return {
    refresh,
    setStatus(text: string) {
      status.textContent = text;
      status.classList.toggle('is-visible', text.length > 0);
    },
  };
}
