import type { Host } from '@hk/protocol';
import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { WebPlatform } from './platform/web/WebPlatform';

// Newgrounds entry (vite.newgrounds.config.js swaps it in): the plain browser host, no portal SDK,
// no ads and no store, reporting to the backend as `newgrounds` so its players count apart from
// h.gamestao.com's.
class NewgroundsPlatform extends WebPlatform {
  override readonly host: Host = 'newgrounds';
}

boot(new NewgroundsPlatform(), DEFAULT_SCENE).catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
