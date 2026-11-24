/**
 * The interface, after shan-shui-inf's.
 *
 * Upstream's page is two 32px hairline boxes in the top-left — ☰ for the menu
 * and `</>` for the source — a bordered panel of `<pre>`-labelled controls,
 * and two big 〈 〉 hit areas flanking the artwork. It is deliberately
 * unstyled, and that restraint is the point: nothing competes with the
 * painting.
 *
 * What differs from upstream, on purpose: its SEED field reloads the whole
 * page, where this regenerates in place and keeps the URL in sync, so a view
 * stays linkable. The arrow does not reseed anything in either version — it
 * walks further along the same infinite scroll.
 */

const ICONS = {
  menu: '&#x2630;',
  close: '&#x2715;',
  source: '&lt;/&gt;',
  left: '&#x3008;',
  right: '&#x3009;',
};

export interface ShellOptions {
  repoUrl: string;
  currentSeed(): string;
  currentStep(): number;
  currentDetail(): number;
  onSeed(seed: string): void;
  /** Walk the scroll by `delta` world units. */
  onStep(delta: number): void;
  onStepSize(size: number): void;
  onAutoScroll(on: boolean): void;
  onDetail(detail: number): void;
  onExportSvg(): void;
  onExportPng(): void;
}

export interface Shell {
  setStatus(text: string): void;
  refresh(): void;
  /** Turn the auto-scroll checkbox off without re-entering the callback. */
  clearAutoScroll(): void;
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
  // --- the two buttons ----------------------------------------------------
  const controls = el('div', 'controls');

  const menuBtn = el('button', 'hair-btn', ICONS.menu);
  menuBtn.title = 'Settings';
  menuBtn.setAttribute('aria-label', 'Settings');

  const sourceLink = el('a', 'hair-btn', ICONS.source);
  sourceLink.href = opts.repoUrl;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.title = 'Source on GitHub';
  sourceLink.setAttribute('aria-label', 'Source on GitHub');

  controls.append(menuBtn, sourceLink);

  // --- the menu -----------------------------------------------------------
  const menu = el('section', 'menu');

  const seedRow = el('div', 'menu__row');
  seedRow.append(el('pre', 'menu__label', 'SEED'));
  const seedLine = el('div', 'menu__line');
  const seedInput = el('input', 'menu__input');
  seedInput.type = 'text';
  seedInput.spellcheck = false;
  seedInput.title = 'random seed';
  const genBtn = el('button', 'menu__btn', 'Generate');
  const commitSeed = (): void => opts.onSeed(seedInput.value.trim());
  genBtn.addEventListener('click', commitSeed);
  seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commitSeed();
      seedInput.blur();
    }
  });
  seedLine.append(seedInput, genBtn);
  seedRow.append(seedLine);
  menu.append(seedRow);

  const viewRow = el('div', 'menu__row');
  viewRow.append(el('pre', 'menu__label', 'VIEW'));
  const viewLine = el('div', 'menu__line');
  const backBtn = el('button', 'menu__btn', '&lt;');
  backBtn.title = 'view left';
  const stepInput = el('input', 'menu__input menu__input--num');
  stepInput.type = 'number';
  stepInput.min = '0';
  stepInput.max = '10000';
  stepInput.step = '20';
  stepInput.title = 'increment step';
  const fwdBtn = el('button', 'menu__btn', '&gt;');
  fwdBtn.title = 'view right';
  const step = (): number => Number(stepInput.value) || 200;
  backBtn.addEventListener('click', () => opts.onStep(-step()));
  fwdBtn.addEventListener('click', () => opts.onStep(step()));
  stepInput.addEventListener('change', () => opts.onStepSize(step()));
  viewLine.append(backBtn, stepInput, fwdBtn);
  viewRow.append(viewLine);
  menu.append(viewRow);

  const autoRow = el('div', 'menu__row');
  const autoLabel = el('label', 'menu__check');
  const autoBox = el('input');
  autoBox.type = 'checkbox';
  autoBox.addEventListener('change', () => opts.onAutoScroll(autoBox.checked));
  autoLabel.append(autoBox, document.createTextNode(' Auto-scroll'));
  autoRow.append(autoLabel);
  menu.append(autoRow);

  const detailRow = el('div', 'menu__row');
  const detailLabel = el('pre', 'menu__label', 'DETAIL');
  detailRow.append(detailLabel);
  const detail = el('input', 'menu__range');
  detail.type = 'range';
  detail.min = '0.3';
  detail.max = '1';
  detail.step = '0.05';
  detail.title = 'lower this if scrolling stutters';
  detail.addEventListener('change', () => opts.onDetail(Number(detail.value)));
  detailRow.append(detail);
  menu.append(detailRow);

  const saveRow = el('div', 'menu__row');
  saveRow.append(el('pre', 'menu__label', 'SAVE'));
  const saveLine = el('div', 'menu__line');
  const svgBtn = el('button', 'menu__btn', 'Download as .SVG');
  svgBtn.title = 'WARNING: this may take a while';
  svgBtn.addEventListener('click', opts.onExportSvg);
  const pngBtn = el('button', 'menu__btn', '.PNG');
  pngBtn.addEventListener('click', opts.onExportPng);
  saveLine.append(svgBtn, pngBtn);
  saveRow.append(saveLine);
  menu.append(saveRow);

  const about = el('div', 'menu__about');
  about.innerHTML =
    `After <a href="https://github.com/LingDong-/shan-shui-inf" target="_blank" ` +
    `rel="noopener noreferrer">shan-shui-inf</a> by Lingdong Huang (MIT, © 2018). ` +
    `Drawing ported; engine and seeding original. ` +
    `<a href="${opts.repoUrl}/blob/main/NOTICE.md" target="_blank" rel="noopener noreferrer">NOTICE</a>.`;
  menu.append(about);

  let menuOpen = false;
  const setMenu = (open: boolean): void => {
    menuOpen = open;
    menu.classList.toggle('is-open', open);
    menuBtn.innerHTML = open ? ICONS.close : ICONS.menu;
  };
  menuBtn.addEventListener('click', () => setMenu(!menuOpen));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) setMenu(false);
  });

  // --- the edge arrows ----------------------------------------------------
  const left = el('button', 'edge edge--left', `<span>${ICONS.left}</span>`);
  left.title = 'view left';
  left.setAttribute('aria-label', 'Scroll left');
  left.addEventListener('click', () => opts.onStep(-step()));

  const right = el('button', 'edge edge--right', `<span>${ICONS.right}</span>`);
  right.title = 'view right';
  right.setAttribute('aria-label', 'Scroll right');
  right.addEventListener('click', () => opts.onStep(step()));

  const status = el('div', 'status');

  root.append(controls, menu, left, right, status);

  function refresh(): void {
    seedInput.value = opts.currentSeed();
    stepInput.value = String(opts.currentStep());
    detail.value = String(opts.currentDetail());
  }

  refresh();

  return {
    refresh,
    clearAutoScroll() {
      autoBox.checked = false;
    },
    setStatus(text: string) {
      status.textContent = text;
      status.classList.toggle('is-visible', text.length > 0);
    },
  };
}
