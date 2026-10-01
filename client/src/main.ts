import { Assets } from 'pixi.js';
import { loadArt } from './art';
import { Game } from './game/Game';
import { WebPlatform } from './platform/web/WebPlatform';

// Web entry (dev server, and later the CrazyGames / Poki builds).
async function boot() {
  const platform = new WebPlatform();
  const app = await platform.createApp();
  await Assets.init();
  new Game(app, platform, await loadArt(platform));
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
