import type { Texture } from 'pixi.js';
import type { MobSheet } from './mobView';
import type { StageArt } from './stageArt';
import type { MonkId } from '@hk/engine';
import type { TaoAsset } from './tao/TaoActor';

// The art a run is drawn with (loaded by art.ts): what every chapter shares, and the chapters'
// own, chapter 4 and 5 from their art packs once a run of theirs has loaded them.

export interface Art {
  /** The kicker's rig. */
  hero: TaoAsset;
  /** The bought monks' rigs (art/monks, an art pack): each loaded by the first run played as him. */
  monks: Partial<Record<MonkId, TaoAsset>>;
  jiangshi: MobSheet;
  fox: MobSheet;
  cuju: Texture;
  staff: Texture;
  fish: Texture;
  /**
   * Grounds by chapter from chapter 1; a chapter without its own takes the last one. Chapters
   * in an art pack (chapter 4 on) add theirs when the pack is loaded (loadChapterArt).
   */
  stages: StageArt[];
  /** The boss rig; null when the scene leaves the boss out. */
  boss: TaoAsset | null;
  /** Build icons by item id (relic, spells, passives) for the HUD and the cards. */
  icons: ReadonlyMap<string, Texture>;
  /** Chapter 2's mobs, elite and boss (tools/bake_mob.py, specs in art/monk/mobs). */
  marsh: { ghost: MobSheet; toad: MobSheet; toadKing: MobSheet; carp: MobSheet };
  /** Chapter 3's. */
  snow: { wolf: MobSheet; wolfLeader: MobSheet; wraith: MobSheet; skeleton: MobSheet; shard: MobSheet; witch: MobSheet };
  /** Chapter 4's, from its art pack: null until a chapter 4 (or 5) run loads it. */
  ghost: GhostArt | null;
  /** Chapter 5's, from its own pack: null until a chapter 5 run loads it. */
  peak: PeakArt | null;
}

export interface PeakArt {
  monk: MobSheet;
  shadow: MobSheet;
  /** The Inner Demon: the hero's rig on a cold recolour of his atlas. */
  demon: TaoAsset;
}

export interface GhostArt {
  tongue: MobSheet;
  lantern: MobSheet;
  effigy: MobSheet;
  doorGod: MobSheet;
  judge: MobSheet;
}

/** The rig a run plays monk `monk` with. */
export function monkRig(art: Art, monk: MonkId): TaoAsset {
  return art.monks[monk] ?? art.hero;
}
