import type { Container, Renderer, Texture } from 'pixi.js';
import { chapterBoss, type BossKind, type EliteKind, type MobKind } from '@hk/engine';
import { t } from '../i18n';
import { BossBar } from './bossBar';
import { Boss } from './bossView';
import { BossStage, type BossViews } from './bossStage';
import { CarpView } from './carpView';
import { EliteCrowd, EliteView } from './eliteView';
import type { FxPool } from './fx';
import type { Art } from './Game';
import { MOB_HEIGHT } from './hordeView';
import { fakeMobTypes } from './mobTypes';
import type { MobLook, MobSheet } from './mobView';
import type { EliteColor, SceneOptions } from './scene';
import { makeRing } from './stageArt';
import { JUDGE_STYLE, StaffBossView, WITCH_STYLE } from './witchView';
import { wispSheet } from './wispSheet';

// Who a run is played against, by chapter (engine CHAPTER_MOBS, CHAPTER_ELITES,
// CHAPTER_BOSSES): the looks of the horde's kinds, the elites' views and the boss views.

/** The elite is a big jiangshi. */
export const ELITE_HEIGHT = 140;
/** The toad king, chapter 2's elite, squat and wide. */
const TOAD_KING_HEIGHT = 150;
/** The wolf leader, chapter 3's elite: long rather than tall. */
const WOLF_LEADER_HEIGHT = 125;
const ELITE_RING: Record<EliteColor, number> = { red: 0xe0303a, white: 0xffffff, violet: 0xb04cff };
/** The big jiangshi is a darker steel blue than the horde; the mid-boss's second twin a slate violet. */
const ELITE_TINTS = [0x9fb2d8, 0xb4a6d4];
/** Chapter 3's jiangshi are frosted a pale ice blue. */
const FROST_TINT = 0xb8d0f0;
/** The door god, chapter 4's elite: a big statue. */
const DOOR_GOD_HEIGHT = 155;
/** The Bone Witch is drawn a little taller than the abbot, the Underworld Judge taller still. */
const WITCH_SCALE = 1.1;
const JUDGE_SCALE = 1.2;
/** Chapter 4's lantern ghost floats a little taller than a toad squats. */
const LANTERN_HEIGHT = 80;

/** The looks of every mob kind in chapter `chapter` (0 for the sandbox). */
export function hordeLooks(renderer: Renderer, art: Art, scene: SceneOptions, chapter: number, shadowTex: Texture): Record<MobKind, MobLook[]> {
  const look = (sheet: MobSheet, kind: MobKind, shadow: [number, number], facesLeft = true, tint?: number, height = MOB_HEIGHT[kind]): MobLook => (
    { sheet, height, facesLeft, shadow, shadowTex, tint }
  );
  const jiangshi = fakeMobTypes(renderer, art.jiangshi, scene.types, scene.page, scene.mobRes);
  // chapter 2's walkers are water ghosts, chapter 3's frosted jiangshi, chapter 4's long-tongue
  // ghosts (its emergers too); its shooters are lantern ghosts
  const ghost = art.ghost && chapter >= 4 ? art.ghost.tongue : art.marsh.ghost;
  const snow = art.snow;
  const market = art.ghost;
  const effigy = market?.effigy ?? art.jiangshi;
  return {
    chaser: chapter === 2 || (market && chapter >= 4) ? [look(ghost, 'chaser', [27, 9])]
      : jiangshi.map((sheet) => look(sheet, 'chaser', [27, 9], true, chapter === 3 ? FROST_TINT : undefined)),
    runner: [look(art.fox, 'runner', [36, 9], false)],
    swarm: [look(wispSheet(renderer), 'swarm', [18, 6])],
    emerger: [look(ghost, 'emerger', [27, 9])],
    shooter: [market && chapter >= 4 ? look(market.lantern, 'shooter', [26, 8], true, undefined, LANTERN_HEIGHT) : look(art.marsh.toad, 'shooter', [34, 10])],
    wolf: [look(snow.wolf, 'wolf', [38, 10])],
    caster: [look(snow.wraith, 'caster', [26, 8])],
    skeleton: [look(snow.skeleton, 'skeleton', [28, 9])],
    shard: [look(snow.shard, 'shard', [26, 8])],
    effigy: [look(effigy, 'effigy', [28, 9])],
    scrap: [look(effigy, 'scrap', [18, 6])],
  };
}

/** The elites' views; the mid-boss twins share a bar in a chapter. */
export function makeElites(renderer: Renderer, world: Container, art: Art, scene: SceneOptions, chapter: boolean, shadowTex: Texture, topZ: number): EliteCrowd {
  const looks: Record<EliteKind, MobLook> = {
    charger: { sheet: art.jiangshi, height: ELITE_HEIGHT, facesLeft: true, shadow: [46, 14], shadowTex },
    toadKing: { sheet: art.marsh.toadKing, height: TOAD_KING_HEIGHT, facesLeft: true, shadow: [70, 20], shadowTex },
    wolfLeader: { sheet: art.snow.wolfLeader, height: WOLF_LEADER_HEIGHT, facesLeft: true, shadow: [64, 16], shadowTex },
    doorGod: { sheet: art.ghost?.doorGod ?? art.jiangshi, height: DOOR_GOD_HEIGHT, facesLeft: true, shadow: [60, 18], shadowTex },
  };
  const ring = () => makeRing(renderer, ELITE_RING[scene.eliteColor], 1.8, scene.eliteColor !== 'red');
  // only the big jiangshi is tinted; the others are drawn in their own colours
  const tint = (k: number, kind: EliteKind) => (kind === 'charger' ? ELITE_TINTS[k % ELITE_TINTS.length] : 0xffffff);
  return new EliteCrowd(
    (k, kind) => new EliteView(kind, world, looks[kind], ring(), tint(k, kind), scene.eliteRing, topZ),
    chapter ? new BossBar(t('boss.twins')) : null,
  );
}

/**
 * The boss views a run needs: its chapter's boss and, from chapter 2 on, the last chapter's
 * as the empowered mid-boss; the abbot alone in the sandbox (if it has a boss). Null for none.
 */
export function makeBosses(renderer: Renderer, world: Container, art: Art, scene: SceneOptions, chapter: number, sandboxBoss: boolean, shadowTex: Texture, fx: FxPool): BossStage | null {
  const kinds = new Set<BossKind>();
  if (chapter > 0) {
    kinds.add(chapterBoss(chapter));
    if (chapter >= 2) kinds.add(chapterBoss(chapter - 1));
  } else if (sandboxBoss) kinds.add('abbot');
  const views: BossViews = {};
  if (kinds.has('abbot') && art.boss) views.abbot = new Boss(renderer, world, art.boss, shadowTex, scene.bossSize, fx);
  if (kinds.has('carp')) views.carp = new CarpView(renderer, art.marsh.carp, world, shadowTex, scene.bossSize, fx);
  if (kinds.has('witch')) views.witch = new StaffBossView(renderer, art.snow.witch, world, shadowTex, scene.bossSize * WITCH_SCALE, fx, WITCH_STYLE);
  if (kinds.has('judge') && art.ghost) views.judge = new StaffBossView(renderer, art.ghost.judge, world, shadowTex, scene.bossSize * JUDGE_SCALE, fx, JUDGE_STYLE);
  return Object.keys(views).length > 0 ? new BossStage(views) : null;
}
