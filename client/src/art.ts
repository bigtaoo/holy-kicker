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
import WEBP_ART from './webpArt.json';
import { fill, loadLate, placeholder, toFill } from './lateArt';

/** Loads of late art (lateArt.ts), started once the first screen's art is in. */
type Late = (() => Promise<void>)[];

// Loads the prototype art. Paths are relative so they resolve both under the web dev
// server (client/public) and inside the WeChat package (client/wechat/art).
export async function loadArt(
  platform: Platform, scene: Pick<SceneOptions, 'ground' | 'deco' | 'softFace' | 'boss'>,
  /** Called as each load lands, with the share done (the loading screen's bar). */
  onProgress: (share: number) => void = () => {},
  /** Leaves what a first run's opening never draws for behind its first frame (lateArt.ts): web hosts. */
  lean = false,
): Promise<Art> {
  const { ground, deco } = scene;
  const late: Late | null = lean ? [] : null;
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
  // screen (loadLobbyArt, chapterArt.ts loadChapterArt); where `lean`, what its opening never draws
  // comes in behind its first frame: the fox runners, the other relics, the awakened ones, the
  // Mountain Palm and the abbot's atlas
  const [hero, monkIcons, jiangshi, fox, cuju, staff, fish, meteor, ruyi, morningBell, lion, palm, mountain, groundTex, decoSheet, boss, icons] = await Promise.all([
    tick(loadTao(platform, 'art/hero')),
    // the monks' portraits for the lobby, 256 px (tools/pack_icons.py --cell 256)
    tick(loadDeco(platform, 'art/icons/monks')),
    tick(loadSheet(platform, 'art/mobs/jiangshi', scene.softFace ? 'art/mobs/jiangshi_soft.png' : undefined)),
    tick(loadSheet(platform, 'art/mobs/fox', undefined, late)),
    // the relics and spell sprites are drawn at a third to a half of their size
    tick(loadPic('art/cuju.png').then(mipmapped)),
    tick(pic('art/staff.png', late)),
    tick(pic('art/fish.png', late)),
    // the awakened relics: Meteor Ball, Ruyi Staff, Morning Bell (art/monk/icons/evolved)
    tick(pic('art/cuju_meteor.png', late)),
    tick(pic('art/staff_ruyi.png', late)),
    tick(pic('art/bell_relic.png', late)),
    // the Thunder Roar's lion head (art/monk/icons/evolved)
    tick(pic('art/lion.png', late)),
    // a first run may deal the palm at its first level-up
    tick(Assets.load<Texture>('art/palm.png').then(mipmapped)),
    // the Mountain Palm's stone hand (art/monk/fx/mountain.txt)
    tick(pic('art/mountain.png', late)),
    tick(ground === 'flat' ? null : loadPic(`art/ground/${ground}.png`)),
    tick(deco === 'none' ? null : loadDeco(platform, 'art/ground/deco')),
    tick(scene.boss ? loadTao(platform, 'art/boss_monk', late) : null),
    // 128 px cells, drawn from about 40 to 100 px
    tick(loadDeco(platform, 'art/icons/icons')),
  ]);
  if (late) void loadLate(() => Promise.all(late.map((load) => load())).then(() => undefined));
  return { hero, jiangshi, fox, cuju, staff, fish, awakened: { meteor, ruyi, bell: morningBell, lion }, palm, mountain, stages: [
    { ground: groundTex, deco: decoSheet, style: TEMPLE_DECO, mist: null },
  ], monks: {}, boss, lobby: null, patrol: null, icons: new Map([...icons.frames, ...monkIcons.frames, ['fig_jiangshi', jiangshi.textures[0]]]), marsh: null, snow: null, ghost: null, peak: null, bosses: {} };
}

/**
 * The PNGs with a lossy WebP beside them (tools/webp.py): the full-colour sheets of the first
 * screen, a quarter of the bytes. Only art never unloaded by its URL belongs here (chapterArt.ts
 * and freeLobbyArt unload by the PNG's).
 */
const WEBP = new Set<string>(WEBP_ART);
let webp = false;

/** A 1 x 1 lossy WebP with alpha (Google's feature test image). */
const WEBP_PROBE = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==';

/**
 * Whether this browser decodes a lossy WebP with alpha the way Pixi decodes textures
 * (createImageBitmap where there is one, else an <img>). Never throws: false on any doubt.
 */
export async function webpDecodes(): Promise<boolean> {
  try {
    if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
      const bmp = await createImageBitmap(await (await fetch(WEBP_PROBE)).blob());
      const ok = bmp.width === 1 && bmp.height === 1;
      bmp.close?.();
      if (!ok) return false;
    }
    if (typeof Image === 'undefined') return false;
    return await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width === 1 && img.height === 1);
      img.onerror = () => resolve(false);
      img.src = WEBP_PROBE;
    });
  } catch {
    return false;
  }
}

/** Lets loadPic take the WebP files (boot.ts, once webpDecodes said yes; never on WeChat). */
export function useWebp(on: boolean): void {
  webp = on;
}

/** A texture by its PNG's path: the WebP beside it where listed and decodable, the PNG if that load fails. */
export function loadPic(png: string): Promise<Texture> {
  if (!webp || !WEBP.has(png)) return Assets.load<Texture>(png);
  return Assets.load<Texture>(`${png.slice(0, -'.png'.length)}.webp`).catch(() => Assets.load<Texture>(png));
}

/** A picture, mipmapped; with `late`, a placeholder now that a late load fills. */
function pic(png: string, late: Late | null): Promise<Texture> {
  if (!late) return loadPic(png).then(mipmapped);
  const tex = placeholder();
  late.push(() => loadPic(png).then((real) => fill([tex], mipmapped(real).source)));
  return Promise.resolve(tex);
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
      loadDeco(platform, LOBBY.props, false),
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

/**
 * Gives `tex` mipmaps, for art drawn well below its own size: a phone shows the mobs, the rigs
 * and the icons at a quarter to a half of their texels, and shrinking without mipmaps picks
 * single texels out of them, which sparkles. Set before its first draw, when the GPU copy is
 * made (WebGL1 skips it for a texture that is not 2^n).
 */
export function mipmapped(tex: Texture): Texture {
  tex.source.autoGenerateMipmaps = true;
  return tex;
}

/** A named-frame sheet: <name>.json + <name>.png (tools/pack_deco.py, tools/pack_icons.py).
 *  `mipmaps` off for one drawn at about its own size (the lobby's). */
export async function loadDeco(platform: Platform, path: string, mipmaps = true): Promise<DecoSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), loadPic(`${path}.png`)]);
  if (mipmaps) mipmapped(sheet);
  return sliceDeco((JSON.parse(text) as { frames: DecoFrame[] }).frames, sheet);
}

/** A baked mob: <path>.json + <path>.png, or another png with the same layout; with `late`, the png comes later. */
export async function loadSheet(platform: Platform, path: string, png = `${path}.png`, late?: Late | null): Promise<MobSheet> {
  const [text, sheet] = await Promise.all([platform.readText(`${path}.json`), late ? placeholder() : Assets.load<Texture>(png).then(mipmapped)]);
  const out = sliceSheet(JSON.parse(text) as SheetMeta, sheet);
  if (late) {
    toFill(out.textures);
    late.push(() => Assets.load<Texture>(png).then((real) => fill(out.textures, mipmapped(real).source)));
  }
  return out;
}

/** A .tao bundle unpacked into a folder: skeleton.json + atlas.png (tools/pack_tao.py); with `late`, the atlas comes later. */
export async function loadTao(platform: Platform, dir: string, late?: Late | null): Promise<TaoAsset> {
  const [text, atlas] = await Promise.all([
    platform.readText(`${dir}/skeleton.json`),
    late ? placeholder() : loadPic(`${dir}/atlas.png`).then(mipmapped),
  ]);
  const skeleton = JSON.parse(text) as TaoSkeleton;
  if (skeleton.version !== 1) throw new Error(`${dir}: unsupported .tao version ${skeleton.version}`);
  const out = sliceAtlas(skeleton, atlas);
  if (late) {
    toFill(out.textures.values());
    late.push(() => loadPic(`${dir}/atlas.png`).then((real) => fill(out.textures.values(), mipmapped(real).source)));
  }
  return out;
}
