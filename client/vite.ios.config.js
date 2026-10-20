import { defineConfig } from 'vite';
import { engineAlias } from '../build/hkAlias.mjs';
import { buildDefine } from '../build/buildId.mjs';
import { themeAssets } from '../build/theme.mjs';

// The iOS build of one art set: `npm run build:ios` (Holy Kicker) or `npm run build:ios:new` (the
// corgi's Corgi Commando, vite.ios.new.config.js) writes client/dist-ios/, which `npx cap sync ios`
// copies into the Capacitor shell (capacitor.config.ts, docs/ios.md; build/setIosApp.mjs makes the
// shell the corgi's). The same page as the web build with
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

export function iosConfig(theme) {
  return defineConfig({
    base: './',
    resolve: { alias: engineAlias },
    define: buildDefine(theme),
    plugins: [iosHtml(), themeAssets(theme)],
    server: { port: theme === 'monk' ? 5176 : 5186, host: true },
    // Safari 15 is the oldest web view the shell runs in (iOS 15)
    build: { target: ['es2020', 'safari15'], outDir: 'dist-ios', emptyOutDir: true },
  });
}

export default iosConfig('monk');
