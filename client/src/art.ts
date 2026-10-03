import { Assets, type Texture } from 'pixi.js';
import type { Art } from './game/Game';
import type { SheetMeta } from './game/mobAnim';
import { sliceSheet, type MobSheet } from './game/mobView';
import { sliceAtlas, type TaoAsset } from './game/tao/TaoActor';
import type { TaoSkeleton } from './game/tao/types';
import type { Platform } from './platform/types';
import type { SceneOptions } from './game/scene';
import { MARSH_DECO, sliceDeco, TEMPLE_DECO, type DecoFrame, type DecoSheet } from './game/decoView';

// Loads the prototype art. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(platform: Platform, scene: Pick<SceneOptions, 'ground' | 'deco' | 'softFace' | 'boss'>): Promise<Art> {
  const { ground, deco } = scene;
  const [hero, jiangshi, fox, cuju, staff, fish, groundTex, decoSheet, marshTex, marshDeco, boss, icons] = await Promise.all([
    loadTao(platform, 'art/hero'),
    loadSheet(platform, 'art/mobs/jiangshi', scene.softFace ? 'art/mobs/jiangshi_soft.png' : undefined),
    loadSheet(platform, 'art/mobs/fox'),
    Assets.load<Texture>('art/cuju.png'),
    Assets.load<Texture>('art/staff.png'),
    Assets.load<Texture>('art/fish.png'),
    ground === 'flat' ? null : Assets.load<Texture>(`art/ground/${ground}.png`),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/deco'),
    // chapter 2's misty marsh; ?ground picks chapter 1's only
    ground === 'flat' ? null : Assets.load<Texture>('art/ground/marsh.png'),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/marsh_deco'),
    scene.boss ? loadTao(platform, 'art/boss_monk') : null,
    loadDeco(platform, 'art/icons/icons'),
  ]);
  return { hero, jiangshi, fox, cuju, staff, fish, stages: [
    { ground: groundTex, deco: decoSheet, style: TEMPLE_DECO },
    { ground: marshTex, deco: marshDeco, style: MARSH_DECO },
  ], boss, icons: icons.frames };
}

/** A named-frame sheet: <name>.json + <name>.png (tools/pack_deco.py, tools/pack_icons.py). */
async function loadDeco(platform: Platform, path: string): Promise<DecoSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), Assets.load<Texture>(`${path}.png`)]);
  return sliceDeco((JSON.parse(text) as { frames: DecoFrame[] }).frames, sheet);
}

/** A baked mob loop: <name>.json + <name>.png (tools/bake_mob.py). */
/** A baked mob: <path>.json + <path>.png, or another png with the same layout. */
async function loadSheet(platform: Platform, path: string, png = `${path}.png`): Promise<MobSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), Assets.load<Texture>(png)]);
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
