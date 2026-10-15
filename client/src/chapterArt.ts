import { Assets, type Texture } from 'pixi.js';
import { loadDeco, loadSheet, loadTao } from './art';
import type { Art } from './game/Game';
import { CHAPTER_PIECES, piecesFor, piecesKept, type ChapterPiece } from './game/chapterNeeds';
import { GHOST_DECO, MARSH_DECO, PEAK_DECO, SNOW_DECO } from './game/decoView';
import { MARSH_MIST } from './game/mistView';
import type { SceneOptions } from './game/scene';
import type { Platform } from './platform/types';

// The later chapters' art, piece by piece (game/chapterNeeds.ts): chapter 2's misty marsh (in
// the main package, but no first run needs it), then the art packs (art/ch<n>/, WeChat
// subpackages): chapter 3's snow pass, chapter 4's ghost market and chapter 5's Demon Peak, each
// with its ground and props, mobs and elite, and the baked bosses on their own. A run loads what
// its chapter draws; freeChapterArt drops the mobs and bosses no chapter near the next run's
// draws, so a player back in chapter 1 after the Demon Peak does not carry all five chapters'
// hordes. The grounds and props stay: they are small, and `art.stages` is indexed by chapter.

type Scene = Pick<SceneOptions, 'ground' | 'deco'>;

interface Piece {
  /** The art pack it comes from, a WeChat subpackage. */
  pack?: string;
  /** Loads it into `art`; what it fetches through Assets goes into `got`, to unload with it. */
  load(platform: Platform, scene: Scene, art: Art, got: string[]): Promise<void>;
  drop(art: Art): void;
}

/** A baked mob sheet whose png goes into `got`. */
function sheet(platform: Platform, path: string, got: string[]) {
  got.push(`${path}.png`);
  return loadSheet(platform, path);
}

const PIECES: Record<ChapterPiece, Piece> = {
  marsh: {
    async load(platform, { ground, deco }, art, got) {
      const [marsh, marshDeco, ghost, toad, toadKing] = await Promise.all([
        ground === 'flat' ? null : Assets.load<Texture>('art/ground/marsh.png'),
        deco === 'none' ? null : loadDeco(platform, 'art/ground/marsh_deco'),
        // the water ghost, toad and toad king
        sheet(platform, 'art/mobs/waterghost', got),
        sheet(platform, 'art/mobs/toad', got),
        sheet(platform, 'art/mobs/toad_king', got),
      ]);
      art.stages[1] = { ground: marsh, deco: marshDeco, style: MARSH_DECO, mist: MARSH_MIST };
      art.marsh = { ghost, toad, toadKing };
    },
    drop: (art) => void (art.marsh = null),
  },
  // the Black Carp King
  carp: {
    load: async (platform, _scene, art, got) => void (art.bosses.carp = await sheet(platform, 'art/mobs/carp', got)),
    drop: (art) => delete art.bosses.carp,
  },
  snow: {
    pack: 'ch3',
    async load(platform, { ground, deco }, art, got) {
      const [snow, snowDeco, wolf, wolfLeader, wraith, skeleton, shard] = await Promise.all([
        ground === 'flat' ? null : Assets.load<Texture>('art/ch3/ground/snow.png'),
        deco === 'none' ? null : loadDeco(platform, 'art/ch3/ground/snow_deco'),
        sheet(platform, 'art/ch3/mobs/wolf', got),
        sheet(platform, 'art/ch3/mobs/wolf_leader', got),
        sheet(platform, 'art/ch3/mobs/icewraith', got),
        sheet(platform, 'art/ch3/mobs/skeleton', got),
        sheet(platform, 'art/ch3/mobs/shard', got),
      ]);
      art.stages[2] = { ground: snow, deco: snowDeco, style: SNOW_DECO, mist: null };
      art.snow = { wolf, wolfLeader, wraith, skeleton, shard };
    },
    drop: (art) => void (art.snow = null),
  },
  // the Bone Witch
  witch: {
    pack: 'ch3',
    load: async (platform, _scene, art, got) => void (art.bosses.witch = await sheet(platform, 'art/ch3/mobs/witch', got)),
    drop: (art) => delete art.bosses.witch,
  },
  ghost: {
    pack: 'ch4',
    async load(platform, { ground, deco }, art, got) {
      const [street, streetDeco, tongue, lantern, effigy, doorGod] = await Promise.all([
        ground === 'flat' ? null : Assets.load<Texture>('art/ch4/ground/street.png'),
        deco === 'none' ? null : loadDeco(platform, 'art/ch4/ground/street_deco'),
        sheet(platform, 'art/ch4/mobs/tongue', got),
        sheet(platform, 'art/ch4/mobs/lantern', got),
        sheet(platform, 'art/ch4/mobs/effigy', got),
        sheet(platform, 'art/ch4/mobs/doorgod', got),
      ]);
      art.stages[3] = { ground: street, deco: streetDeco, style: GHOST_DECO, mist: null };
      art.ghost = { tongue, lantern, effigy, doorGod };
    },
    drop: (art) => void (art.ghost = null),
  },
  // the Underworld Judge
  judge: {
    pack: 'ch4',
    load: async (platform, _scene, art, got) => void (art.bosses.judge = await sheet(platform, 'art/ch4/mobs/judge', got)),
    drop: (art) => delete art.bosses.judge,
  },
  peak: {
    pack: 'ch5',
    async load(platform, { ground, deco }, art, got) {
      const [cave, caveDeco, monk, shadow, demon] = await Promise.all([
        ground === 'flat' ? null : Assets.load<Texture>('art/ch5/ground/cave.png'),
        deco === 'none' ? null : loadDeco(platform, 'art/ch5/ground/cave_deco'),
        sheet(platform, 'art/ch5/mobs/monk', got),
        sheet(platform, 'art/ch5/mobs/shadow', got),
        loadTao(platform, 'art/ch5/demon').then((a) => (got.push('art/ch5/demon/atlas.png'), a)),
      ]);
      art.stages[4] = { ground: cave, deco: caveDeco, style: PEAK_DECO, mist: null };
      art.peak = { monk, shadow, demon };
    },
    drop: (art) => void (art.peak = null),
  },
};

/** Pieces loading or loaded, with the urls each fetched through Assets. */
const loaded = new Map<ChapterPiece, { done: Promise<void>; urls: string[] }>();

/** Loads the art a run of `chapter` draws into `art`, what is not loaded yet. */
export async function loadChapterArt(platform: Platform, scene: Scene, art: Art, chapter: number): Promise<void> {
  const want = piecesFor(chapter);
  for (const key of CHAPTER_PIECES) {
    if (!want.has(key)) continue;
    let entry = loaded.get(key);
    if (!entry) {
      const piece = PIECES[key];
      const urls: string[] = [];
      const done = (piece.pack ? platform.loadPack(piece.pack) : Promise.resolve()).then(() => piece.load(platform, scene, art, urls));
      entry = { done, urls };
      loaded.set(key, entry);
      // a failed load is forgotten, so the next call tries again
      done.catch(() => loaded.delete(key));
    }
    await entry.done;
  }
}

/**
 * Frees the mobs and bosses neither chapter `chapter` nor the next draws. Called as a run of
 * `chapter` is about to load, with no run on screen; it waits out loads in flight first.
 */
export async function freeChapterArt(art: Art, chapter: number): Promise<void> {
  await Promise.allSettled([...loaded.values()].map((e) => e.done));
  const keep = piecesKept(chapter);
  for (const [key, entry] of loaded) {
    if (keep.has(key)) continue;
    loaded.delete(key);
    PIECES[key].drop(art);
    await Promise.all(entry.urls.map((url) => Assets.unload(url)));
  }
}
