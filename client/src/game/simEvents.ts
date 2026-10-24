import { DROPS, EVOLVE, FP, TICK_RATE, type SimEvent, type SimState } from '@hk/engine';
import type { ArsenalView } from './arsenalView';
import type { BossStage } from './bossStage';
import { blockFx, howlFx, nearestElite } from './eliteView';
import type { DropLayer } from './dropView';
import type { FishTaps } from './fishView';
import type { FxLayer } from './fxView';
import type { HeroView } from './heroes';
import type { HitFeedback } from './hitFeedback';
import type { HordeView } from './hordeView';
import type { KillCamView } from './killCamView';
import type { LowHealthView } from './lowHealthView';
import type { Shake } from './shake';
import type { SpellView } from './spellView';
import type { StaffSwing } from './staffView';
import type { SutraView } from './sutraView';
import type { ThreatLayer } from './threatView';
import { summonFx } from './witchView';

// The run's reaction to the sim's events (Game.frame, after each tick): animations, effects and
// numbers. Drawing the state every frame stays in Game.draw.

/** The local player's owner id; online play would get it from the match. */
export const LOCAL = 0;

/** The run's views the events move; `hurt` starts the hero's red flash. */
export interface EventViews {
  hero: HeroView;
  feedback: HitFeedback;
  staff: StaffSwing;
  fish: FishTaps;
  downCam: KillCamView;
  lowHp: LowHealthView;
  fx: FxLayer;
  horde: HordeView;
  boss: BossStage | null;
  shake: Shake;
  threats: ThreatLayer | null;
  drops: DropLayer;
  spells: SpellView;
  arsenal: ArsenalView;
  sutras: SutraView;
  hurt(): void;
}

/** One tick's events on state `s`. Positions arrive in FP. */
export function reactTo(v: EventViews, events: readonly SimEvent[], s: SimState): void {
  for (const e of events) {
    switch (e.type) {
      case 'kick':
        if (e.owner === LOCAL) v.hero.attack(s.players[0].relicId);
        break;
      case 'sweep': {
        v.feedback.sweep(e);
        const p = s.players.find((q) => q.owner === e.owner);
        if (e.owner !== LOCAL || !p) break;
        v.staff.swing(e.brad, e.reach / FP, e.full, p.facing);
        v.hero.swing();
        break;
      }
      case 'ring': {
        const p = s.players.find((q) => q.owner === e.owner);
        if (e.owner === LOCAL && p) v.fish.tap(e.x / FP, e.y / FP, e.reach / FP, e.stun, p.awakened, p.facing, v.hero.hand('hand_b'));
        break;
      }
      case 'hurt':
        if (e.owner === LOCAL) {
          v.hero.hurt();
          v.hurt();
          v.downCam.struck(e.src, e.x, e.y);
        }
        break;
      case 'heroDown':
        if (e.owner === LOCAL && s.config.waves > 0) v.downCam.down(s);
        break;
      case 'revive':
        if (e.owner === LOCAL) [v.downCam, v.lowHp].forEach((v) => v.reset());
        break;
      case 'hit':
        v.feedback.hit(e, s);
        break;
      case 'eliteDown':
        v.feedback.eliteDown(e);
        break;
      case 'cleared':
        v.hero.cheer?.('proud');
        v.feedback.rout(s);
        break;
      case 'mobDown':
        v.feedback.mobDown(e, s);
        break;
      case 'block': {
        // a door god's shield, or a fallen monk's gong (held toward the hero)
        const g = e.index < s.mobs.length ? null : nearestElite(s.elites, e.x, e.y);
        blockFx(v.fx.pool, e.x / FP, e.y / FP, g ? g.vx : s.players[0].x - e.x, g ? 80 : 45);
        break;
      }
      case 'emerge':
        v.horde.emerge(e.x / FP, e.y / FP);
        break;
      case 'howl':
        howlFx(v.fx.pool, e.x / FP, e.y / FP, e.radius / FP);
        break;
      case 'summon':
        summonFx(v.fx.pool, e.x / FP, e.y / FP);
        break;
      case 'bossCast':
      case 'bossDive':
      case 'bossWindup':
      case 'bossSlam':
      case 'bossDown':
      case 'bossBack':
      case 'bossNext': // the rush's next boss enters as a boss coming back
        if (e.type === 'bossDown') {
          v.shake.blow();
          v.hero.cheer?.('proud');
        }
        if (s.boss) v.boss?.react(e, s.boss);
        break;
      case 'blast':
        v.threats?.blast(e.x / FP, e.y / FP, e.radius / FP);
        break;
      case 'pickup': {
        const p = s.players.find((q) => q.owner === e.owner);
        if (p && e.owner === LOCAL) v.drops.pickup(p.x / FP, p.y / FP, e.tier);
        if (e.owner === LOCAL && e.tier >= DROPS.tiers.length) v.hero.cheer?.('happy');
        break;
      }
      case 'cast':
      case 'palm':
      case 'clang':
        v.spells.cast(e);
        break;
      case 'bomb':
      case 'boom':
      case 'seal':
        if (e.type === 'boom') v.feedback.boom(e);
        v.arsenal.on(e);
        break;
      case 'bolt':
        v.spells.bolt(e.x0 / FP, e.y0 / FP, e.x1 / FP, e.y1 / FP, e.gold);
        break;
      case 'bloom':
      case 'roar':
      case 'bounce':
        v.sutras.react(e);
        break;
      case 'dodge': {
        const p = s.players.find((q) => q.owner === e.owner);
        if (p) v.sutras.dodge(p.x / FP, p.y / FP);
        break;
      }
      case 'pick':
        if (e.owner === LOCAL) v.hero.cheer?.('happy');
        break;
      case 'wave':
        v.hero.cheer?.('proud');
        break;
      case 'bellUp':
        if (e.owner === LOCAL) v.spells.bellUp();
        break;
      case 'bellBreak':
        if (e.owner === LOCAL && s.players[0].spells.some((sp) => sp.id === 'bell' && sp.evolved)) {
          v.spells.guard(EVOLVE.bellGuard / TICK_RATE);
        }
        break;
    }
  }
  v.feedback.tick(s);
}
