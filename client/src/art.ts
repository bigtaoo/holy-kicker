import type { MonkId } from '@hk/engine';
import { Assets, type Texture } from 'pixi.js';
import type { Art } from './game/Game';
import type { SheetMeta } from './game/mobAnim';
import { sliceSheet, type MobSheet } from './game/mobView';
import { sliceAtlas, type TaoAsset } from './game/tao/TaoActor';
import type { TaoSkeleton } from './game/tao/types';
import { MARSH_MIST } from './game/mistView';
import type { Platform } from './platform/types';
import type { SceneOptions } from './game/scene';
import { GHOST_DECO, MARSH_DECO, PEAK_DECO, sliceDeco, SNOW_DECO, TEMPLE_DECO, type DecoFrame, type DecoSheet } from './game/decoView';

// Loads the prototype art. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(platform: Platform, scene: Pick<SceneOptions, 'ground' | 'deco' | 'softFace' | 'boss'>): Promise<Art> {
  const { ground, deco } = scene;
  const [hero, monkIcons, jiangshi, fox, cuju, staff, fish, palm, groundTex, decoSheet, marshTex, marshDeco, boss, icons, ghost, toad, toadKing, carp, snowTex, snowDeco, wolf, wolfLeader, wraith, skeleton, shard, witch] = await Promise.all([
    loadTao(platform, 'art/hero'),
    // the monks' portraits for the lobby, 256 px (tools/pack_icons.py --cell 256)
    loadDeco(platform, 'art/icons/monks'),
    loadSheet(platform, 'art/mobs/jiangshi', scene.softFace ? 'art/mobs/jiangshi_soft.png' : undefined),
    loadSheet(platform, 'art/mobs/fox'),
    Assets.load<Texture>('art/cuju.png'),
    Assets.load<Texture>('art/staff.png'),
    Assets.load<Texture>('art/fish.png'),
    Assets.load<Texture>('art/palm.png'),
    ground === 'flat' ? null : Assets.load<Texture>(`art/ground/${ground}.png`),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/deco'),
    // chapter 2's misty marsh; ?ground picks chapter 1's only
    ground === 'flat' ? null : Assets.load<Texture>('art/ground/marsh.png'),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/marsh_deco'),
    scene.boss ? loadTao(platform, 'art/boss_monk') : null,
    loadDeco(platform, 'art/icons/icons'),
    // chapter 2's water ghost, toad, toad king and Black Carp King
    loadSheet(platform, 'art/mobs/waterghost'),
    loadSheet(platform, 'art/mobs/toad'),
    loadSheet(platform, 'art/mobs/toad_king'),
    loadSheet(platform, 'art/mobs/carp'),
    // chapter 3's snow pass: wolves, the wolf leader, ice wraiths and the Bone Witch's own
    ground === 'flat' ? null : Assets.load<Texture>('art/ground/snow.png'),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/snow_deco'),
    loadSheet(platform, 'art/mobs/wolf'),
    loadSheet(platform, 'art/mobs/wolf_leader'),
    loadSheet(platform, 'art/mobs/icewraith'),
    loadSheet(platform, 'art/mobs/skeleton'),
    loadSheet(platform, 'art/mobs/shard'),
    loadSheet(platform, 'art/mobs/witch'),
  ]);
  return { hero, jiangshi, fox, cuju, staff, fish, palm, stages: [
    { ground: groundTex, deco: decoSheet, style: TEMPLE_DECO, mist: null },
    { ground: marshTex, deco: marshDeco, style: MARSH_DECO, mist: MARSH_MIST },
    { ground: snowTex, deco: snowDeco, style: SNOW_DECO, mist: null },
  ], monks: {}, boss, icons: new Map([...icons.frames, ...monkIcons.frames]), marsh: { ghost, toad, toadKing, carp }, snow: { wolf, wolfLeader, wraith, skeleton, shard, witch }, ghost: null, peak: null };
}

/**
 * Loads the art packs (art/ch<n>/, WeChat subpackages) chapter `chapter` needs into `art`, those
 * not loaded yet: chapter 4's ghost market (its ground, props and mobs), which chapter 5 plays
 * too (its lantern ghosts, effigies, door god and the empowered Judge), and chapter 5's Demon Peak.
 */
export async function loadChapterArt(platform: Platform, scene: Pick<SceneOptions, 'ground' | 'deco'>, art: Art, chapter: number): Promise<void> {
  const { ground, deco } = scene;
  if (chapter >= 4 && !art.ghost) {
    await platform.loadPack('ch4');
    const [street, streetDeco, tongue, lantern, effigy, doorGod, judge] = await Promise.all([
      ground === 'flat' ? null : Assets.load<Texture>('art/ch4/ground/street.png'),
      deco === 'none' ? null : loadDeco(platform, 'art/ch4/ground/street_deco'),
      loadSheet(platform, 'art/ch4/mobs/tongue'),
      loadSheet(platform, 'art/ch4/mobs/lantern'),
      loadSheet(platform, 'art/ch4/mobs/effigy'),
      loadSheet(platform, 'art/ch4/mobs/doorgod'),
      loadSheet(platform, 'art/ch4/mobs/judge'),
    ]);
    art.stages[3] = { ground: street, deco: streetDeco, style: GHOST_DECO, mist: null };
    art.ghost = { tongue, lantern, effigy, doorGod, judge };
  }
  if (chapter >= 5 && !art.peak) {
    await platform.loadPack('ch5');
    const [cave, caveDeco, monk, shadow, demon] = await Promise.all([
      ground === 'flat' ? null : Assets.load<Texture>('art/ch5/ground/cave.png'),
      deco === 'none' ? null : loadDeco(platform, 'art/ch5/ground/cave_deco'),
      loadSheet(platform, 'art/ch5/mobs/monk'),
      loadSheet(platform, 'art/ch5/mobs/shadow'),
      loadTao(platform, 'art/ch5/demon'),
    ]);
    art.stages[4] = { ground: cave, deco: caveDeco, style: PEAK_DECO, mist: null };
    art.peak = { monk, shadow, demon };
  }
}

/** Loads monk `monk`'s rig into `art` (the kicker's is always there) from the 'monks' art pack. */
export async function loadMonkArt(platform: Platform, art: Art, monk: MonkId): Promise<void> {
  if (monk === 'kicker' || art.monks[monk]) return;
  await platform.loadPack('monks');
  art.monks[monk] = await loadTao(platform, `art/monks/${monk}`);
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
