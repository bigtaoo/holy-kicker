import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';

// The iOS build: `npm run build:ios` writes client/dist-ios/, which `npx cap sync ios` copies into
// the Capacitor shell (capacitor.config.ts, docs/ios.md). The same page as the web build with
// src/main.ios.ts as its entry, rewritten on both hooks for the reason vite.crazygames.config.js
// gives; the build fails if the rewrite never ran rather than shipping the browser entry.

const DEFAULT_ENTRY = '/src/main.ts';
const IOS_ENTRY = '/src/main.ios.ts';

const iosHtml = () => {
  let applied = false;
  const apply = (html) => {
    const out = html.replace(DEFAULT_ENTRY, IOS_ENTRY);
    if (out.includes(IOS_ENTRY)) applied = true;
    return out;
  };
  return {
    name: 'ios-html',
    enforce: 'pre',
    transform(code, id) {
      return id.endsWith('.html') ? apply(code) : null;
    },
    transformIndexHtml: apply,
    closeBundle() {
      if (!applied) throw new Error('vite.ios.config.js: index.html was never rewritten for the iOS entry');
    },
  };
};

export default defineConfig({
  base: './',
  resolve: { alias: engineAlias },
  define: buildDefine(),
  plugins: [iosHtml()],
  server: { port: 5176, host: true },
  // Safari 15 is the oldest web view the shell runs in (iOS 15)
  build: { target: ['es2020', 'safari15'], outDir: 'dist-ios', emptyOutDir: true },
});
