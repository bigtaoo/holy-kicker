import { Assets } from 'pixi.js';
import { loadArt } from './art';
import { Game } from './game/Game';
import { parseScene } from './game/scene';
import { levelRange, useMsaa } from './game/quality';
import { QualityRuntime, gpuName } from './game/qualityRuntime';
import { WebPlatform } from './platform/web/WebPlatform';

// Web entry (dev server, and later the CrazyGames / Poki builds).
async function boot() {
  const platform = new WebPlatform();
  const scene = parseScene(location.search);
  const device = await platform.probe();
  const app = await platform.createApp(useMsaa(scene.quality, device));
  device.gpu = gpuName(app.renderer);
  await Assets.init();
  const game = new Game(app, platform, await loadArt(platform, scene.ground, scene.deco), scene);
  const quality = new QualityRuntime(app, levelRange(scene.quality, device), (s) => game.applyQuality(s));
  // dev hook for soak tests and screenshots driven from the console
  if (import.meta.env.DEV) Object.assign(window, { __app: app, __game: game, __quality: quality, __device: device });
}

boot().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
