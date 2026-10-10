import type { Texture } from 'pixi.js';
import type { MobSheet } from './mobView';
import type { StageArt } from './stageArt';
import type { MonkId } from '@hk/engine';
import type { TaoAsset } from './tao/TaoActor';
import type { PatrolArt } from '../ui/patrolScene';

// The art a run is drawn with (loaded by art.ts): what every chapter shares, and the chapters'
// own, chapters 3 to 5 from their art packs once a run of theirs has loaded them.

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
   * The evolved looks: the awakened relics' (the burning Meteor Ball, the Ruyi Staff, the
   * Morning Bell) and the Thunder Roar's lion head.
   */
  awakened: { meteor: Texture; ruyi: Texture; bell: Texture; lion: Texture };
  /** The Rulai Palm's golden hand. */
  palm: Texture;
  /** The Mountain Palm's (evolved) stone hand. */
  mountain: Texture;
  /**
   * Grounds by chapter from chapter 1; a chapter without its own takes the last one. Chapters
   * in an art pack (chapter 3 on) add theirs when the pack is loaded (loadChapterArt).
   */
  stages: StageArt[];
  /** The boss rig; null when the scene leaves the boss out. */
  boss: TaoAsset | null;
  /** The lobby's painted backdrop. */
  lobby: Texture;
  /** The patrol panel's far hills and roadside props (art/monk/ui/patrol). */
  patrol: PatrolArt;
  /** Build icons by item id (relic, spells, passives) for the HUD and the cards. */
  icons: ReadonlyMap<string, Texture>;
  /** Chapter 2's mobs, elite and boss (tools/bake_mob.py, specs in art/monk/mobs). */
  marsh: { ghost: MobSheet; toad: MobSheet; toadKing: MobSheet; carp: MobSheet };
  /** Chapter 3's, from its art pack: null until a run from chapter 3 on loads it. */
  snow: SnowArt | null;
  /** Chapter 4's, from its art pack: null until a chapter 4 (or 5) run loads it. */
  ghost: GhostArt | null;
  /** Chapter 5's, from its own pack: null until a chapter 5 run loads it. */
  peak: PeakArt | null;
}

export interface SnowArt {
  wolf: MobSheet;
  wolfLeader: MobSheet;
  wraith: MobSheet;
  skeleton: MobSheet;
  shard: MobSheet;
  witch: MobSheet;
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
