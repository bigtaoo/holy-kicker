import { Assets, type Texture } from 'pixi.js';
import type { Art } from './game/Game';
import { sliceAtlas, type TaoAsset } from './game/tao/TaoActor';
import type { TaoSkeleton } from './game/tao/types';
import type { Platform } from './platform/types';

// Loads the prototype art. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(platform: Platform): Promise<Art> {
  const [jiangshi, fox] = await Promise.all(
    ['art/jiangshi.png', 'art/fox.png'].map((p) => Assets.load<Texture>(p)),
  );
  return { hero: await loadTao(platform, 'art/hero'), jiangshi, fox };
}

/** A .tao bundle unpacked into a folder: skeleton.json + atlas.png (tools/pack_tao.py). */
async function loadTao(platform: Platform, dir: string): Promise<TaoAsset> {
  const [text, atlas] = await Promise.all([
    platform.readText(`${dir}/skeleton.json`),
    Assets.load<Texture>(`${dir}/atlas.png`),
  ]);
  const skeleton = JSON.parse(text) as TaoSkeleton;
  if (skeleton.version !== 1) throw new Error(`${dir}: unsupported .tao version ${skeleton.version}`);
  return sliceAtlas(skeleton, atlas);
}
