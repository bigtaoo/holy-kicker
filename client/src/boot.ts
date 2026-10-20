import { Assets } from 'pixi.js';
import { loadArt, useWebp, webpDecodes } from './art';
import { DEFAULT_LOCALE, getLocale, loadLocale, setLocale } from './i18n';
import { watchAnomalies } from './net/anomaly';
import { apiBase, Backend } from './net/backend';
import { hitchContext, liveMobs, memProbe, PerfReport, sessionDevice } from './net/perfReport';
import { deviceTimeZone, PrivacyChoice } from './net/privacyChoice';
import { levelRange, lowBattery, useMsaa } from './game/quality';
import { QualityRuntime, gpuName } from './game/qualityRuntime';
import type { SceneOptions } from './game/scene';
import { SaveStore } from './meta/saveStore';
import { loadSettings, pickLocale } from './meta/settings';
import type { Platform } from './platform/types';
import { privacyToast } from './ui/privacyUi';
import { Shell } from './ui/Shell';

// Boot shared by every entry: the language, the renderer, the art, then the shell. The
// platform is fully initialised before this runs (CrazyGames waits for its SDK first, since
// the save lives in the SDK's data module).
/** The page's loading screen bar (index.html), at `share` of the way; no page on WeChat. */
function bootBar(share: number): void {
  if (typeof document !== 'undefined') document.getElementById?.('boot')?.style.setProperty('--p', share.toFixed(3));
}

export async function boot(platform: Platform, scene: SceneOptions, opts: { skipDetections?: boolean; direct?: boolean } = {}) {
  // the script is in: about a third of the way (the bar crept there on its own while it came)
  bootBar(0.3);
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
  await lang;
  useWebp(await webp);
  const art = await loadArt(platform, scene, (k) => bootBar(0.35 + 0.55 * k));
  const artMs = since();
  const shell = new Shell(app, platform, art, scene, new SaveStore(platform.storage), net, device.tablet ? 'tablet' : device.mobile ? 'mobile' : 'desktop', privacy, sessionDevice(device));
  const quality = new QualityRuntime(app, levelRange(mode, device), (s) => shell.applyQuality(s), () => !shell.run?.stepping);
  // frame rates and things gone wrong on the device (the `perf` and `anomaly` events)
  const probe = memProbe(app);
  const perf = (shell.perf = new PerfReport(net, probe));
  const anomalies = watchAnomalies(app, platform, net, probe, () => {
    const place = shell.place();
    const s = shell.run?.engine.state;
    return place === 'run' && s ? { place, wave: Math.max(1, s.wave) } : { place };
  });
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
  if (privacy?.noticeDue()) {
    privacyToast(app, () => platform.safeInsets());
    privacy.noticeShown();
  }
  return { app, shell, quality, device };
}
