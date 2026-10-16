import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { PlaygamaPlatform } from './platform/playgama/PlaygamaPlatform';

// Playgama entry (vite.playgama.config.js swaps it in and adds the Bridge script). Bridge is
// awaited (bounded at 5 s) before boot, because the save is read through its storage.
async function start() {
  const platform = await PlaygamaPlatform.create();
  await boot(platform, DEFAULT_SCENE);
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
