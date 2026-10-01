import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, rmSync } from 'node:fs';
import { engineAlias } from '../build/hkAlias.mjs';

// WeChat mini-game bundle: one self-contained IIFE at wechat/js/game.js, which
// wechat/game.js requires. Open client/wechat in WeChat DevTools after building.
// Adapted from daydayup's client/vite.wechat.config.js.

// Pixi picks its renderer through a dynamic import. inlineDynamicImports would pull the
// whole WebGPU renderer into the single file even though WeChat only has WebGL, so the
// module is replaced with a stub that throws if it is ever constructed.
const stripWebGPU = {
  name: 'strip-webgpu',
  enforce: 'pre',
  resolveId(source) {
    if (source.endsWith('gpu/WebGPURenderer.mjs')) return '\0webgpu-stub';
    return null;
  },
  load(id) {
    if (id === '\0webgpu-stub') {
      return 'export class WebGPURenderer { constructor() { throw new Error("WebGPU renderer was stripped from the WeChat build (WebGL only)"); } }';
    }
    return null;
  },
};

// A mini-game reads art from its own package by path, so public/art is mirrored next to
// the bundle rather than bundled. Mirror, not merge: a deleted texture leaves the package.
const copyArt = {
  name: 'copy-art',
  closeBundle() {
    const from = fileURLToPath(new URL('./public/art', import.meta.url));
    const to = fileURLToPath(new URL('./wechat/art', import.meta.url));
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    console.log('  mirrored public/art -> wechat/art');
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [stripWebGPU, copyArt],
  resolve: { alias: engineAlias },
  // public/ is mirrored by copyArt; Vite must not also copy it into wechat/js.
  publicDir: false,
  build: {
    target: 'es2020',
    outDir: 'wechat/js',
    emptyOutDir: true,
    minify: mode !== 'development',
    // Guard against a texture silently becoming a base64 string inside the bundle.
    assetsInlineLimit: 0,
    lib: {
      entry: fileURLToPath(new URL('./src/main.wechat.ts', import.meta.url)),
      formats: ['iife'],
      name: 'HolyKicker',
      fileName: () => 'game.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
}));
