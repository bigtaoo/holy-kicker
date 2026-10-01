import { Assets } from 'pixi.js';
import { loadArt } from './art';
import { Game } from './game/Game';
import { parseScene } from './game/scene';
import { WebPlatform } from './platform/web/WebPlatform';

// Web entry (dev server, and later the CrazyGames / Poki builds).
async function boot() {
  const platform = new WebPlatform();
  const app = await platform.createApp();
  await Assets.init();
  const scene = parseScene(location.search);
  const game = new Game(app, platform, await loadArt(platform, scene.ground), scene);
  // dev hook for soak tests and screenshots driven from the console
  if (import.meta.env.DEV) Object.assign(window, { __app: app, __game: game });
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
