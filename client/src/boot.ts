import { Assets } from 'pixi.js';
import { loadArt } from './art';
import { setLocale } from './i18n';
import { levelRange, useMsaa } from './game/quality';
import { QualityRuntime, gpuName } from './game/qualityRuntime';
import type { SceneOptions } from './game/scene';
import { SaveStore } from './meta/saveStore';
import { loadSettings, pickLocale } from './meta/settings';
import type { Platform } from './platform/types';
import { Shell } from './ui/Shell';

// Boot shared by every entry: the language, the renderer, the art, then the shell. The
// platform is fully initialised before this runs (CrazyGames waits for its SDK first, since
// the save lives in the SDK's data module).
export async function boot(platform: Platform, scene: SceneOptions, opts: { skipDetections?: boolean; direct?: boolean } = {}) {
  setLocale(pickLocale(loadSettings(platform.storage), platform.languages()));
  const device = await platform.probe();
  const app = await platform.createApp(useMsaa(scene.quality, device));
  device.gpu = gpuName(app.renderer);
  await Assets.init({ skipDetections: opts.skipDetections });
  const shell = new Shell(app, platform, await loadArt(platform, scene), scene, new SaveStore(platform.storage), !device.mobile);
  const quality = new QualityRuntime(app, levelRange(scene.quality, device), (s) => shell.applyQuality(s));
  shell.start(opts.direct);
  return { app, shell, quality, device };
}
