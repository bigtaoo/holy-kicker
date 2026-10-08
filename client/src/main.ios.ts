import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { IosPlatform } from './platform/ios/IosPlatform';

// iOS entry (vite.ios.config.js swaps it in): the build the Capacitor shell packages (docs/ios.md).
boot(new IosPlatform(), DEFAULT_SCENE).catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
