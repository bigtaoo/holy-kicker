import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';

export default defineConfig({
  // @hk/engine: the deterministic sim, a sibling package at the repo root (build/hkAlias.mjs)
  resolve: { alias: engineAlias },
  server: { port: 5174, host: true },
  build: { target: 'es2020', outDir: 'dist' },
});
