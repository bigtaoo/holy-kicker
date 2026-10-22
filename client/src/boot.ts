// first, so that errors thrown while the rest loads are caught too (net/earlyErrors.ts)
import { takeEarlyErrors } from './net/earlyErrors';
import { Assets } from 'pixi.js';
import { loadArt, useWebp, webpDecodes } from './art';
import { warmTextures } from './gpuWarm';
import { DEFAULT_LOCALE, getLocale, loadLocale, setLocale, t } from './i18n';
import { cleanMsg, watchAnomalies } from './net/anomaly';
import { AnomalyStash } from './net/anomalyStash';
import { apiBase, Backend } from './net/backend';
import { CloudSync } from './net/cloudSync';
import { hitchContext, liveMobs, memProbe, PerfReport, sessionDevice } from './net/perfReport';
import { deviceTimeZone, PrivacyChoice } from './net/privacyChoice';
import { patchGraphicsDestroy } from './game/graphicsDestroy';
import { levelRange, lowBattery, useMsaa } from './game/quality';
import { QualityRuntime, gpuName } from './game/qualityRuntime';
import type { SceneOptions } from './game/scene';
import { SaveStore } from './meta/saveStore';
import { loadSettings, pickLocale } from './meta/settings';
import type { Platform } from './platform/types';
import { privacyToast } from './ui/privacyUi';
import { DISPLAY_FAMILY, DISPLAY_FILE, setDisplayFont } from './ui/fonts';
import { Shell } from './ui/Shell';
import { lateArt } from './lateArt';
import { THEME } from './theme';

// Boot shared by every entry: the language, the renderer, the art, then the shell. The
// platform is fully initialised before this runs (CrazyGames waits for its SDK first, since
// the save lives in the SDK's data module).
/** The page's loading screen bar (index.html), at `share` of the way; no page on WeChat. */
function bootBar(share: number): void {
  if (typeof document !== 'undefined') document.getElementById?.('boot')?.style.setProperty('--p', share.toFixed(3));
}

export async function boot(platform: Platform, scene: SceneOptions, opts: { skipDetections?: boolean; direct?: boolean } = {}) {
  try {
    return await bootGame(platform, scene, opts);
  } catch (err) {
    // no reporter came up: what went wrong waits on the device for the next launch (net/anomalyStash.ts)
    try {
      const stash = new AnomalyStash(platform.storage);
      for (const e of [...takeEarlyErrors(), { msg: cleanMsg(err) }]) stash.push({ kind: 'error', place: 'boot', ...e });
    } catch {
      /* the storage is the platform's; boot's own failure is what the caller shows */
    }
    throw err;
  }
}

async function bootGame(platform: Platform, scene: SceneOptions, opts: { skipDetections?: boolean; direct?: boolean }) {
  // the script is in: about a third of the way (the bar crept there on its own while it came)
  bootBar(0.3);
  // destroyed trees free their graphics' contexts (game/graphicsDestroy.ts)
  patchGraphicsDestroy();
  const since = () => (typeof performance === 'undefined' ? 0 : performance.now());
  const script = since();
  const settings = loadSettings(platform.storage);
  // a language past en and zh is its own chunk: fetched while the renderer comes up (English if it fails)
  const locale = pickLocale(settings, platform.languages());
  const lang = loadLocale(locale).then((ok) => setLocale(ok ? locale : DEFAULT_LOCALE));
  // the first screen's colour sheets come as WebP where the browser decodes them (a quarter of
  // the bytes; art.ts falls back to the PNG on any failed load); WeChat ships the PNGs alone
  const webp = opts.skipDetections ? Promise.resolve(false) : webpDecodes();
  let mode = scene.quality ?? settings.quality;
  let low = false;
  const device = await platform.probe();
  const app = await platform.createApp(useMsaa(mode, device));
  device.gpu = gpuName(app.renderer);
  await Assets.init({ skipDetections: opts.skipDetections });
  const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const api = apiBase(platform.host, import.meta.env.DEV, query, import.meta.env.VITE_HK_API);
  // a host that blocks the backend plays offline, but its own analytics still follow the privacy answer
  const base = platform.backendBlocked ? null : api;
  const net = new Backend(platform, base, __HK_BUILD__, getLocale);
  // set before the shell's first event: in the EEA nothing goes out until the player says yes
  const privacy = api ? new PrivacyChoice(net, platform, api, deviceTimeZone()) : null;
  // the display font, before the first text is measured; system fonts if it fails or is slow
  const font = Promise.race([
    platform.loadFont(DISPLAY_FILE, DISPLAY_FAMILY).catch(() => null),
    new Promise<null>((done) => setTimeout(() => done(null), 4000)),
  ]);
  await lang;
  useWebp(await webp);
  // WeChat ships its art in the package and the iOS app on the device: only the web waits on a network
  const art = await loadArt(platform, scene, (k) => bootBar(0.35 + 0.55 * k), platform.host !== 'wechat' && platform.host !== 'ios');
  setDisplayFont(await font);
  // on the GPU behind the loading screen, not in the first run's first frame
  warmTextures(app.renderer, art);
  void lateArt().then(() => warmTextures(app.renderer, art));
  const artMs = since();
  const store = new SaveStore(platform.storage);
  const shell = new Shell(app, platform, art, scene, store, net, device.tablet ? 'tablet' : device.mobile ? 'mobile' : 'desktop', privacy, sessionDevice(device));
  // the cloud save where the host keeps none of its own (docs/cloud-save.md "The cloud save")
  const cloud = base && (platform.host === 'web' || platform.host === 'ios') ? new CloudSync({
    base, game: THEME, kv: platform.storage, store, reload: () => shell.reloadSave(), playing: () => shell.place() === 'run',
    askCode: () => platform.askText({
      title: t('cloud.askTitle'), prompt: t('cloud.askPrompt'), placeholder: t('cloud.placeholder'), send: t('cloud.send'), cancel: t('cloud.cancel'), max: 20,
    }),
    copyText: platform.copyText?.bind(platform),
  }) : null;
  shell.cloud = cloud;
  const quality = new QualityRuntime(app, levelRange(mode, device), (s) => shell.applyQuality(s), () => !shell.run?.stepping);
  // frame rates and things gone wrong on the device (the `perf` and `anomaly` events)
  const probe = memProbe(app);
  const perf = (shell.perf = new PerfReport(net, probe));
  const anomalies = watchAnomalies(app, platform, net, probe, () => {
    const place = shell.place();
    const s = shell.run?.engine.state;
    return place === 'run' && s ? { place, wave: Math.max(1, s.wave) } : { place };
  }, takeEarlyErrors());
  shell.onFault = (err) => anomalies.error(err);
  quality.onFault = (err) => shell.fault(err);
  quality.onBattleFrame = (f) => {
    const s = shell.run?.engine.state;
    perf.frame(f, s ? liveMobs(s) : 0, s ? hitchContext(s) : 0);
    anomalies.frame(f.ms);
    platform.analytics?.frame(f.ms);
  };
  // a ?quality= dev switch pins the mode for the session
  if (!scene.quality) shell.onQualityMode = (m) => quality.setRange(levelRange((mode = m), device, low));
  platform.onBattery((b) => {
    if (lowBattery(b, low) === low) return;
    low = !low;
    quality.setRange(levelRange(mode, device, low));
  });
  bootBar(0.95);
  await shell.start(opts.direct);
  // the page's loading screen (index.html) goes once the first screen is up; no page on WeChat
  if (typeof document !== 'undefined') document.getElementById?.('boot')?.remove();
  net.loaded({ script, art: artMs });
  cloud?.auto();
  platform.onHide(() => cloud?.auto());
  if (privacy?.noticeDue()) {
    privacyToast(app, () => platform.safeInsets());
    privacy.noticeShown();
  }
  return { app, shell, quality, device, cloud };
}
