import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { cleanMsg } from './net/anomaly';
import { AnomalyStash } from './net/anomalyStash';
import { BootTrail } from './platform/ios/bootTrail';
import { IosPlatform } from './platform/ios/IosPlatform';
import { applyDownloaded, failedOta, readyOta } from './platform/ios/ota';
import { showVideoBadges } from './ui/widgets';

// iOS entry (vite.ios.config.js swaps it in): the build the Capacitor shell packages (docs/ios.md).

// how far this launch gets, on the device as it goes: a launch that never finishes (a throw, the
// web view killed, a hot update rolled back) is reported by the next one (platform/ios/bootTrail.ts)
const trail = new BootTrail(localStorage, __HK_BUNDLE__, __HK_BUILD__, () => performance.now());
const onError = (e: ErrorEvent) => trail.error(cleanMsg(e.error ?? e.message));
const onRejection = (e: PromiseRejectionEvent) => trail.error(cleanMsg(e.reason));
addEventListener('error', onError);
addEventListener('unhandledrejection', onRejection);

function finished() {
  trail.done();
  removeEventListener('error', onError);
  removeEventListener('unhandledrejection', onRejection);
}

async function start() {
  // a hot update the last session downloaded: the page reloads into it, so nothing boots here
  if (await applyDownloaded()) {
    finished();
    return;
  }
  trail.step('platform');
  const platform = new IosPlatform();
  // the last launch's failure and bundles the updater rolled back go out with this launch's
  // anomalies, once the reporter is up (net/anomalyStash.ts)
  const stash = new AnomalyStash(platform.storage);
  if (trail.last) stash.push(trail.last);
  for (const bundle of await failedOta()) stash.push({ kind: 'ota_fail', place: 'boot', bundle, msg: `running ${__HK_BUNDLE__}` });
  // with the ad-free card, rewarded offers pay at once: no video badge on them
  showVideoBadges(!platform.storeKit.owned());
  const { shell, cloud } = await boot(platform, DEFAULT_SCENE, { stage: (stage, info) => trail.step(stage, info) });
  // the cloud save keys a Game Center player's slot on the account (bridge v5)
  if (cloud) cloud.gcIdentity = () => platform.gameCenter.identity();
  // Game Center answers some time after launch, and again after a sign-in (the cloud save then
  // merges the device's slot with the account's); StoreKit at launch, after a purchase or a
  // restore, and when a refund or a parent's approval comes in
  platform.gameCenter.onChange = () => {
    shell.reloadSave();
    if (platform.gameCenter.alias()) cloud?.account();
  };
  platform.storeKit.onChange = () => {
    showVideoBadges(!platform.storeKit.owned());
    shell.reloadSave();
  };
  // this bundle booted, so the plugin keeps it; the lobby offers a newer one (ui/updatePrompt.ts)
  void readyOta().then(finished);
}

start().catch((err) => {
  trail.error(cleanMsg(err));
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
