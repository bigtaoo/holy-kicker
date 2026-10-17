import type { MonkId } from '@hk/engine';
import { Assets, type Texture } from 'pixi.js';
import type { Art } from './game/Game';
import type { SheetMeta } from './game/mobAnim';
import { sliceSheet, type MobSheet } from './game/mobView';
import { sliceAtlas, type TaoAsset } from './game/tao/TaoActor';
import type { TaoSkeleton } from './game/tao/types';
import type { Platform } from './platform/types';
import type { SceneOptions } from './game/scene';
import { sliceDeco, TEMPLE_DECO, type DecoFrame, type DecoSheet } from './game/decoView';

// Loads the prototype art. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(
  platform: Platform, scene: Pick<SceneOptions, 'ground' | 'deco' | 'softFace' | 'boss'>,
  /** Called as each load lands, with the share done (the loading screen's bar). */
  onProgress: (share: number) => void = () => {},
): Promise<Art> {
  const { ground, deco } = scene;
  // every load is counted before the first lands (then() runs later), so the share only grows
  let started = 0;
  let done = 0;
  function tick<T>(p: Promise<T>): Promise<T>;
  function tick<T>(p: Promise<T> | null): Promise<T> | null;
  function tick<T>(p: Promise<T> | null): Promise<T> | null {
    if (!p) return null;
    started++;
    return p.then((v) => {
      onProgress(++done / started);
      return v;
    });
  }
  // only what chapter 1's first run draws: the lobby's and chapter 2's come in behind the first
  // screen (loadLobbyArt, chapterArt.ts loadChapterArt)
  const [hero, monkIcons, jiangshi, fox, cuju, staff, fish, meteor, ruyi, morningBell, lion, palm, mountain, groundTex, decoSheet, boss, icons] = await Promise.all([
    tick(loadTao(platform, 'art/hero')),
    // the monks' portraits for the lobby, 256 px (tools/pack_icons.py --cell 256)
    tick(loadDeco(platform, 'art/icons/monks')),
    tick(loadSheet(platform, 'art/mobs/jiangshi', scene.softFace ? 'art/mobs/jiangshi_soft.png' : undefined)),
    tick(loadSheet(platform, 'art/mobs/fox')),
    tick(Assets.load<Texture>('art/cuju.png')),
    tick(Assets.load<Texture>('art/staff.png')),
    tick(Assets.load<Texture>('art/fish.png')),
    // the awakened relics: Meteor Ball, Ruyi Staff, Morning Bell (art/monk/icons/evolved)
    tick(Assets.load<Texture>('art/cuju_meteor.png')),
    tick(Assets.load<Texture>('art/staff_ruyi.png')),
    tick(Assets.load<Texture>('art/bell_relic.png')),
    // the Thunder Roar's lion head (art/monk/icons/evolved)
    tick(Assets.load<Texture>('art/lion.png')),
    tick(Assets.load<Texture>('art/palm.png')),
    // the Mountain Palm's stone hand (art/monk/fx/mountain.txt)
    tick(Assets.load<Texture>('art/mountain.png')),
    tick(ground === 'flat' ? null : Assets.load<Texture>(`art/ground/${ground}.png`)),
    tick(deco === 'none' ? null : loadDeco(platform, 'art/ground/deco')),
    tick(scene.boss ? loadTao(platform, 'art/boss_monk') : null),
    tick(loadDeco(platform, 'art/icons/icons')),
  ]);
  return { hero, jiangshi, fox, cuju, staff, fish, awakened: { meteor, ruyi, bell: morningBell, lion }, palm, mountain, stages: [
    { ground: groundTex, deco: decoSheet, style: TEMPLE_DECO, mist: null },
  ], monks: {}, boss, lobby: null, patrol: null, icons: new Map([...icons.frames, ...monkIcons.frames, ['fig_jiangshi', jiangshi.textures[0]]]), marsh: null, snow: null, ghost: null, peak: null, bosses: {} };
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

/** The lobby's textures: its backdrop (art/monk/ui), the patrol panel's road and props (art/monk/ui/patrol). */
const LOBBY = { backdrop: 'art/ui/lobby.jpg', far: 'art/ui/patrol_far.jpg', props: 'art/ui/patrol_props' };
/** Settles once freeLobbyArt has let the last lobby art go, so a new load never races the unload. */
let lobbyGone: Promise<void> = Promise.resolve();

/**
 * Loads the lobby's painted backdrop and the patrol panel's road into `art`. A first run shows
 * neither, so they come in behind the first screen; a lobby waits for them.
 */
export function loadLobbyArt(platform: Platform, art: Art): Promise<void> {
  return once('lobby', async () => {
    await lobbyGone;
    const [lobby, far, props] = await Promise.all([
      Assets.load<Texture>(LOBBY.backdrop),
      Assets.load<Texture>(LOBBY.far),
      loadDeco(platform, LOBBY.props),
    ]);
    art.lobby = lobby;
    art.patrol = { far, props: props.frames };
  });
}

/**
 * Lets the lobby's art go while a run plays (several MB of GPU memory no run draws); the next
 * lobby loads it again, from the local cache. Call once the lobby is off screen.
 */
export function freeLobbyArt(art: Art): void {
  const load = loads.get('lobby');
  if (!load) return;
  loads.delete('lobby');
  lobbyGone = load
    .catch(() => undefined)
    .then(() => {
      art.lobby = null;
      art.patrol = null;
      return Promise.all([LOBBY.backdrop, LOBBY.far, `${LOBBY.props}.png`].map((url) => Assets.unload(url)));
    })
    .then(() => undefined, () => undefined);
}

/** Loads monk `monk`'s rig into `art` (the kicker's is always there) from the 'monks' art pack. */
export async function loadMonkArt(platform: Platform, art: Art, monk: MonkId): Promise<void> {
  if (monk === 'kicker' || art.monks[monk]) return;
  await platform.loadPack('monks');
  art.monks[monk] = await loadTao(platform, `art/monks/${monk}`);
}

/** A named-frame sheet: <name>.json + <name>.png (tools/pack_deco.py, tools/pack_icons.py). */
export async function loadDeco(platform: Platform, path: string): Promise<DecoSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), Assets.load<Texture>(`${path}.png`)]);
  return sliceDeco((JSON.parse(text) as { frames: DecoFrame[] }).frames, sheet);
}

/** A baked mob: <path>.json + <path>.png, or another png with the same layout. */
export async function loadSheet(platform: Platform, path: string, png = `${path}.png`): Promise<MobSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), Assets.load<Texture>(png)]);
  return sliceSheet(JSON.parse(text) as SheetMeta, sheet);
}

/** A .tao bundle unpacked into a folder: skeleton.json + atlas.png (tools/pack_tao.py). */
export async function loadTao(platform: Platform, dir: string): Promise<TaoAsset> {
  const [text, atlas] = await Promise.all([
    platform.readText(`${dir}/skeleton.json`),
    Assets.load<Texture>(`${dir}/atlas.png`),
  ]);
  const skeleton = JSON.parse(text) as TaoSkeleton;
  if (skeleton.version !== 1) throw new Error(`${dir}: unsupported .tao version ${skeleton.version}`);
  return sliceAtlas(skeleton, atlas);
}
