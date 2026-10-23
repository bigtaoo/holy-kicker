import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { IosPlatform } from './platform/ios/IosPlatform';
import { applyDownloaded, readyOta } from './platform/ios/ota';
import { showVideoBadges } from './ui/widgets';

// iOS entry (vite.ios.config.js swaps it in): the build the Capacitor shell packages (docs/ios.md).
async function start() {
  // a hot update the last session downloaded: the page reloads into it, so nothing boots here
  if (await applyDownloaded()) return;
  const platform = new IosPlatform();
  // with the ad-free card, rewarded offers pay at once: no video badge on them
  showVideoBadges(!platform.storeKit.owned());
  const { shell, cloud } = await boot(platform, DEFAULT_SCENE);
  // the cloud save finds a Game Center player's slot without a code (bridge v5)
  if (cloud) cloud.gcIdentity = () => platform.gameCenter.identity();
  // Game Center answers some time after launch, and again after a sign-in; StoreKit at launch,
  // after a purchase or a restore, and when a refund or a parent's approval comes in
  platform.gameCenter.onChange = () => shell.reloadSave();
  platform.storeKit.onChange = () => {
    showVideoBadges(!platform.storeKit.owned());
    shell.reloadSave();
  };
  // this bundle booted, so the plugin keeps it; the lobby offers a newer one (ui/updatePrompt.ts)
  void readyOta();
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
