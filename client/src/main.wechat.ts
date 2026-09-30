// WeChat forbids eval / new Function. This swaps Pixi's generated shader/uniform code for
// eval-free versions, so it must load before the renderer is constructed.
import 'pixi.js/unsafe-eval';
import { Assets } from 'pixi.js';
import { loadArt } from './art';
import { Game } from './game/Game';
import { WeChatPlatform } from './platform/wechat/WeChatPlatform';

// WeChat mini-game entry, required by client/wechat/game.js.
async function boot() {
  const platform = new WeChatPlatform();
  const app = await platform.createApp();
  // Pixi's format detection calls document.createElement('video'); a mini-game has no
  // document, so detection is skipped. Init explicitly before the first load, otherwise
  // Assets.load self-initialises with detection on and throws.
  await Assets.init({ skipDetections: true });
  new Game(app, platform, await loadArt());
}

boot().catch((err) => {
  console.error('[holy-kicker] boot failed', err);
});
