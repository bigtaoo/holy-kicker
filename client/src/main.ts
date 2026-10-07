import { boot } from './boot';
import { recordCanvas } from './dev/recorder';
import { parseScene } from './game/scene';
import { WebPlatform } from './platform/web/WebPlatform';

// Web entry (dev server). ?direct skips the lobby for stress tests; ?ads=fake fakes an ad host;
// ?record=SECONDS with ?autoplay records a store video (dev/recorder.ts).
const scene = parseScene(location.search);
boot(new WebPlatform(), scene, { direct: new URLSearchParams(location.search).has('direct') })
  .then((hooks) => {
    if (import.meta.env.DEV && scene.record) recordCanvas(hooks.app.canvas, scene.record, () => !!hooks.shell.run && !hooks.shell.run.rushing);
    // dev hook for soak tests and screenshots driven from the console
    if (import.meta.env.DEV) Object.assign(window, { __app: hooks.app, __shell: hooks.shell, __quality: hooks.quality, __device: hooks.device });
  })
  .catch((err) => {
    console.error(err);
    document.body.textContent = `Boot failed: ${String(err)}`;
  });
