import { boot } from './boot';
import { DEFAULT_SCENE } from './game/scene';
import { GameDistributionPlatform } from './platform/gamedistribution/GameDistributionPlatform';

// GameDistribution entry (vite.gamedistribution.config.js swaps it in). The SDK is added at launch
// and awaited (bounded at 4 s) before boot, as GD asks.
async function start() {
  const platform = await GameDistributionPlatform.create();
  await boot(platform, DEFAULT_SCENE);
}

start().catch((err) => {
  console.error(err);
  document.body.textContent = `Boot failed: ${String(err)}`;
});
