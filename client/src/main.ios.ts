import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { IosPlatform } from './platform/ios/IosPlatform';
import { showVideoBadges } from './ui/widgets';

// iOS entry (vite.ios.config.js swaps it in): the build the Capacitor shell packages (docs/ios.md).
async function start() {
  const platform = new IosPlatform();
  // with the ad-free card, rewarded offers pay at once: no video badge on them
  showVideoBadges(!platform.storeKit.owned());
  const { shell } = await boot(platform, DEFAULT_SCENE);
  // Game Center answers some time after launch, and again after a sign-in; StoreKit at launch,
  // after a purchase or a restore, and when a refund or a parent's approval comes in
  platform.gameCenter.onChange = () => shell.reloadSave();
  platform.storeKit.onChange = () => {
    showVideoBadges(!platform.storeKit.owned());
    shell.reloadSave();
  };
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
