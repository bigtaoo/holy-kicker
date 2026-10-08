import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { IosPlatform } from './platform/ios/IosPlatform';

// iOS entry (vite.ios.config.js swaps it in): the build the Capacitor shell packages (docs/ios.md).
async function start() {
  const platform = new IosPlatform();
  const { shell } = await boot(platform, DEFAULT_SCENE);
  // Game Center answers some time after launch, and again after a sign-in
  platform.gameCenter.onChange = () => shell.reloadSave();
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
