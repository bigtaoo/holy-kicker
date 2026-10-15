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
  // only what chapter 1's first run draws: the lobby's and chapter 2's come in behind the first
  // screen (loadLobbyArt, loadChapterArt)
  const [hero, monkIcons, jiangshi, fox, cuju, staff, fish, meteor, ruyi, morningBell, lion, palm, mountain, groundTex, decoSheet, boss, icons] = await Promise.all([
    loadTao(platform, 'art/hero'),
    // the monks' portraits for the lobby, 256 px (tools/pack_icons.py --cell 256)
    loadDeco(platform, 'art/icons/monks'),
    loadSheet(platform, 'art/mobs/jiangshi', scene.softFace ? 'art/mobs/jiangshi_soft.png' : undefined),
    loadSheet(platform, 'art/mobs/fox'),
    Assets.load<Texture>('art/cuju.png'),
    Assets.load<Texture>('art/staff.png'),
    Assets.load<Texture>('art/fish.png'),
    // the awakened relics: Meteor Ball, Ruyi Staff, Morning Bell (art/monk/icons/evolved)
    Assets.load<Texture>('art/cuju_meteor.png'),
    Assets.load<Texture>('art/staff_ruyi.png'),
    Assets.load<Texture>('art/bell_relic.png'),
    // the Thunder Roar's lion head (art/monk/icons/evolved)
    Assets.load<Texture>('art/lion.png'),
    Assets.load<Texture>('art/palm.png'),
    // the Mountain Palm's stone hand (art/monk/fx/mountain.txt)
    Assets.load<Texture>('art/mountain.png'),
    ground === 'flat' ? null : Assets.load<Texture>(`art/ground/${ground}.png`),
    deco === 'none' ? null : loadDeco(platform, 'art/ground/deco'),
    scene.boss ? loadTao(platform, 'art/boss_monk') : null,
    loadDeco(platform, 'art/icons/icons'),
  ]);
  return { hero, jiangshi, fox, cuju, staff, fish, awakened: { meteor, ruyi, bell: morningBell, lion }, palm, mountain, stages: [
    { ground: groundTex, deco: decoSheet, style: TEMPLE_DECO, mist: null },
  ], monks: {}, boss, lobby: null, patrol: null, icons: new Map([...icons.frames, ...monkIcons.frames]), marsh: null, snow: null, ghost: null, peak: null };
}

/** Loads in flight or done, by name, so a load behind the first screen and a run's own share one fetch. */
const loads = new Map<string, Promise<void>>();

function once(key: string, load: () => Promise<void>): Promise<void> {
  let p = loads.get(key);
  if (!p) {
    // a failed load is forgotten, so the next call tries again
    p = load().catch((err: unknown) => {
      loads.delete(key);
      throw err;
    });
    loads.set(key, p);
  }
  return p;
}

/**
 * Loads the lobby's painted backdrop and the patrol panel's road into `art`. A first run shows
 * neither, so they come in behind the first screen; a lobby waits for them.
 */
export function loadLobbyArt(platform: Platform, art: Art): Promise<void> {
  return once('lobby', async () => {
    const [lobby, far, props] = await Promise.all([
      // the lobby's backdrop (art/monk/ui)
      Assets.load<Texture>('art/ui/lobby.jpg'),
      // the patrol panel's road (art/monk/ui/patrol)
      Assets.load<Texture>('art/ui/patrol_far.jpg'),
      loadDeco(platform, 'art/ui/patrol_props'),
    ]);
    art.lobby = lobby;
    art.patrol = { far, props: props.frames };
  });
}

/**
 * Loads the art chapter `chapter` needs into `art`, what is not loaded yet: chapter 2's misty
 * marsh (in the main package, but no first run needs it), which chapters 4 and 5 play too (water
 * ghosts, the empowered Carp King); then the art packs (art/ch<n>/, WeChat subpackages): chapter 3's snow pass (its ground, props, wolves, ice wraiths and the Bone
 * Witch's own), which the later chapters play too (wolf packs, the empowered Witch), chapter 4's
 * ghost market, which chapter 5 plays too (its lantern ghosts, effigies, door god and the
 * empowered Judge), and chapter 5's Demon Peak.
 */
export async function loadChapterArt(platform: Platform, scene: Pick<SceneOptions, 'ground' | 'deco'>, art: Art, chapter: number): Promise<void> {
  const { ground, deco } = scene;
  if (chapter >= 2 && !art.marsh) await once('marsh', async () => {
    const [marsh, marshDeco, ghost, toad, toadKing, carp] = await Promise.all([
      ground === 'flat' ? null : Assets.load<Texture>('art/ground/marsh.png'),
      deco === 'none' ? null : loadDeco(platform, 'art/ground/marsh_deco'),
      // the water ghost, toad, toad king and Black Carp King
      loadSheet(platform, 'art/mobs/waterghost'),
      loadSheet(platform, 'art/mobs/toad'),
      loadSheet(platform, 'art/mobs/toad_king'),
      loadSheet(platform, 'art/mobs/carp'),
    ]);
    art.stages[1] = { ground: marsh, deco: marshDeco, style: MARSH_DECO, mist: MARSH_MIST };
    art.marsh = { ghost, toad, toadKing, carp };
  });
  if (chapter >= 3 && !art.snow) {
    await platform.loadPack('ch3');
    const [snow, snowDeco, wolf, wolfLeader, wraith, skeleton, shard, witch] = await Promise.all([
      ground === 'flat' ? null : Assets.load<Texture>('art/ch3/ground/snow.png'),
      deco === 'none' ? null : loadDeco(platform, 'art/ch3/ground/snow_deco'),
      loadSheet(platform, 'art/ch3/mobs/wolf'),
      loadSheet(platform, 'art/ch3/mobs/wolf_leader'),
      loadSheet(platform, 'art/ch3/mobs/icewraith'),
      loadSheet(platform, 'art/ch3/mobs/skeleton'),
      loadSheet(platform, 'art/ch3/mobs/shard'),
      loadSheet(platform, 'art/ch3/mobs/witch'),
    ]);
    art.stages[2] = { ground: snow, deco: snowDeco, style: SNOW_DECO, mist: null };
    art.snow = { wolf, wolfLeader, wraith, skeleton, shard, witch };
  }
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
