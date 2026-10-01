import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { CrazyGamesPlatform } from './platform/crazygames/CrazyGamesPlatform';

// CrazyGames entry (vite.crazygames.config.js swaps it in and adds the SDK script). The SDK
// is awaited (bounded at 3 s) before boot, because the save lives in its data module.
async function start() {
  const platform = await CrazyGamesPlatform.create();
  const { shell } = await boot(platform, DEFAULT_SCENE);
  platform.onAccountChange = () => shell.reloadSave();
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
