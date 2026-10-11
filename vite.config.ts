import { defineConfig } from 'vite';

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
// so every asset URL needs that prefix. Locally `vite dev` serves from / —
// hence the mode switch rather than a hard-coded base.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/atlas-inf/' : '/',
  build: {
    target: 'es2022',
    assetsDir: 'assets',
  },
}));
