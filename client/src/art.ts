import { Assets, type Texture } from 'pixi.js';
import type { Art } from './game/Game';
import type { SheetMeta } from './game/mobAnim';
import { sliceSheet, type MobSheet } from './game/mobView';
import { sliceAtlas, type TaoAsset } from './game/tao/TaoActor';
import type { TaoSkeleton } from './game/tao/types';
import type { Platform } from './platform/types';
import type { DecoMode, GroundKind } from './game/scene';
import { sliceDeco, type DecoFrame, type DecoSheet } from './game/decoView';

// Loads the prototype art. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(platform: Platform, ground: GroundKind, deco: DecoMode): Promise<Art> {
  const [hero, jiangshi, fox, cuju, groundTex, decoSheet] = await Promise.all([
    loadTao(platform, 'art/hero'),
    loadSheet(platform, 'art/mobs/jiangshi'),
    loadSheet(platform, 'art/mobs/fox'),
    Assets.load<Texture>('art/cuju.png'),
    ground === 'flat' ? null : Assets.load<Texture>(`art/ground/${ground}.png`),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/deco'),
  ]);
  return { hero, jiangshi, fox, cuju, ground: groundTex, deco: decoSheet };
}

/** Ground decorations: <name>.json + <name>.png (tools/pack_deco.py). */
async function loadDeco(platform: Platform, path: string): Promise<DecoSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), Assets.load<Texture>(`${path}.png`)]);
  return sliceDeco((JSON.parse(text) as { frames: DecoFrame[] }).frames, sheet);
}

/** A baked mob loop: <name>.json + <name>.png (tools/bake_mob.py). */
async function loadSheet(platform: Platform, path: string): Promise<MobSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), Assets.load<Texture>(`${path}.png`)]);
  return sliceSheet(JSON.parse(text) as SheetMeta, sheet);
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
