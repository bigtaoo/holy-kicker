// WeChat forbids eval / new Function. This swaps Pixi's generated shader/uniform code for
// eval-free versions, so it must load before the renderer is constructed.
import 'pixi.js/unsafe-eval';
import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { WeChatPlatform } from './platform/wechat/WeChatPlatform';

// WeChat mini-game entry, required by client/wechat/game.js.
// Pixi's format detection calls document.createElement('video'); a mini-game has no
// document, so detection is skipped (Assets.init must run before the first load).
boot(new WeChatPlatform(), DEFAULT_SCENE, { skipDetections: true }).catch((err) => {
  console.error('[holy-kicker] boot failed', err);
});
