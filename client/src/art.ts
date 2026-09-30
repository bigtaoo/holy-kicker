import { Assets, type Texture } from 'pixi.js';
import type { Art } from './game/Game';

// Loads the prototype sprites. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(): Promise<Art> {
  const [hero, jiangshi, fox] = await Promise.all(
    ['art/hero.png', 'art/jiangshi.png', 'art/fox.png'].map((p) => Assets.load<Texture>(p)),
  );
  return { hero, jiangshi, fox };
}
