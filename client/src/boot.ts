import { Assets } from 'pixi.js';
import { loadArt } from './art';
import { getLocale, setLocale } from './i18n';
import { apiBase, Backend } from './net/backend';
import { deviceTimeZone, PrivacyChoice } from './net/privacyChoice';
import { levelRange, useMsaa } from './game/quality';
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
export async function boot(platform: Platform, scene: SceneOptions, opts: { skipDetections?: boolean; direct?: boolean } = {}) {
  const settings = loadSettings(platform.storage);
  setLocale(pickLocale(settings, platform.languages()));
  const mode = scene.quality ?? settings.quality;
  const device = await platform.probe();
  const app = await platform.createApp(useMsaa(mode, device));
  device.gpu = gpuName(app.renderer);
  await Assets.init({ skipDetections: opts.skipDetections });
  const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const base = apiBase(platform.host, import.meta.env.DEV, query, import.meta.env.VITE_HK_API);
  const net = new Backend(platform, base, __HK_BUILD__, getLocale);
  // set before the shell's first event: in the EEA nothing goes out until the player says yes
  const privacy = base ? new PrivacyChoice(net, platform, base, deviceTimeZone()) : null;
  const shell = new Shell(app, platform, await loadArt(platform, scene), scene, new SaveStore(platform.storage), net, device.tablet ? 'tablet' : device.mobile ? 'mobile' : 'desktop', privacy);
  const quality = new QualityRuntime(app, levelRange(mode, device), (s) => shell.applyQuality(s), () => !shell.run?.stepping);
  // a ?quality= dev switch pins the mode for the session
  if (!scene.quality) shell.onQualityMode = (m) => quality.setRange(levelRange(m, device));
  shell.start(opts.direct);
  if (privacy?.noticeDue()) {
    privacyToast(app, () => platform.safeInsets());
    privacy.noticeShown();
  }
  return { app, shell, quality, device };
}
