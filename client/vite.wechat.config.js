import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';

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

// WeChat's players read Chinese and the main package is capped at 4 MB, so the languages past
// en and zh (src/i18n/more.ts) are left out: the module becomes an empty table.
const onlyEnZh = {
  name: 'only-en-zh',
  enforce: 'pre',
  resolveId(source, importer) {
    if (source === './more' && importer && /[\\/]i18n[\\/]index\.ts$/.test(importer)) return '\0i18n-more-stub';
    return null;
  },
  load(id) {
    return id === '\0i18n-more-stub' ? 'export const MORE = {};' : null;
  },
};

// A mini-game reads art from its own package by path, so public/art is mirrored next to
// the bundle rather than bundled. Mirror, not merge: a deleted texture leaves the package.
// The main package is capped at 4 MB, so each later chapter's art (public/art/ch<n>) is a
// subpackage of its own, named ch<n>: game.json declares it and its root gets the game.js
// entry WeChat requires; the game fetches it with wx.loadSubpackage before the chapter's run
// (art.ts loadChapterArt). The bought monks' rigs (public/art/monks) are a pack the same way,
// 'monks' (art.ts loadMonkArt). The recorded sounds and music (public/audio) are one more
// subpackage, 'audio', which Sound loads at boot. build/checkWeChatPackage.mjs budgets each package.
const copyArt = {
  name: 'copy-art',
  closeBundle() {
    const from = fileURLToPath(new URL('./public/art', import.meta.url));
    const to = fileURLToPath(new URL('./wechat/art', import.meta.url));
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    const packs = readdirSync(to).filter((d) => /^(ch\d+|monks)$/.test(d)).sort();
    for (const name of packs) writeFileSync(`${to}/${name}/game.js`, `// ${name}: an art pack, loaded by wx.loadSubpackage\n`);
    const gameJson = fileURLToPath(new URL('./wechat/game.json', import.meta.url));
    const game = JSON.parse(readFileSync(gameJson, 'utf8'));
    game.subpackages = packs.map((name) => ({ name, root: `art/${name}/` }));
    const audioFrom = fileURLToPath(new URL('./public/audio', import.meta.url));
    const audioTo = fileURLToPath(new URL('./wechat/audio', import.meta.url));
    rmSync(audioTo, { recursive: true, force: true });
    if (existsSync(audioFrom)) {
      cpSync(audioFrom, audioTo, { recursive: true });
      writeFileSync(`${audioTo}/game.js`, '// audio: sounds and music, loaded by wx.loadSubpackage\n');
      game.subpackages.push({ name: 'audio', root: 'audio/' });
      packs.push('audio');
    }
    writeFileSync(gameJson, `${JSON.stringify(game, null, 2)}\n`);
    console.log(`  mirrored public/art and public/audio -> wechat (subpackages: ${packs.join(', ') || 'none'})`);
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [stripWebGPU, onlyEnZh, copyArt],
  resolve: { alias: engineAlias },
  define: buildDefine(),
  // public/ is mirrored by copyArt; Vite must not also copy it into wechat/js.
  publicDir: false,
  build: {
    // es2019: WeChat DevTools' package validator (which also gates preview QR codes and
    // real-device debugging) rejects optional chaining and ?? (a sibling project hit
    // "SyntaxError: Unexpected token ." there), so esbuild lowers them, dependencies included.
    // build/checkWeChatPackage.mjs fails the check if any slip through.
    target: 'es2019',
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
