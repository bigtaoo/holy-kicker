import type { Container } from 'pixi.js';
import { AffixBadges } from './affixBadge';
import { BOSS_BAR_H, BOSS_BAR_TOP } from './bossBar';
import { FP, type Boss as BossState, type BossKind, type SimEvent } from '@hk/engine';
import type { Boss } from './bossView';
import type { CarpView } from './carpView';
import type { DemonView } from './demonView';
import type { StaffBossView } from './witchView';

// The chapter's boss views by kind: the abbot's rig, the Black Carp King, the Bone Witch, the
// Underworld Judge and the Inner Demon, each the boss of its chapter and, empowered, the mid-boss of the next.
// The sim has one boss at a time; the stage sends its events and drawing to that kind's view
// and keeps the others hidden.

export interface BossViews {
  abbot?: Boss;
  carp?: CarpView;
  witch?: StaffBossView;
  judge?: StaffBossView;
  demon?: DemonView;
}

type BossLike = Boss | CarpView | StaffBossView | DemonView;

export class BossStage {
  private readonly all: BossLike[];
  /** The standing boss's affixes (act 3 on), at the right end over its bar. */
  private readonly badges = new AffixBadges(64);

  constructor(private readonly views: BossViews) {
    this.all = Object.values(views) as BossLike[];
  }

  /** The views' bars and the affix badges, to add to the screen. */
  get huds(): Container[] {
    return [...this.all.map((v) => v.hud), this.badges.view];
  }

  /** Draws the bosses over the horde, at z. */
  setZ(z: number): void {
    for (const v of this.all) v.view.zIndex = z;
  }

  layout(playW: number, scale: number): void {
    for (const v of this.all) v.layout(playW, scale);
    // centred under the bar
    this.badges.view.scale.set(scale);
    this.badges.view.position.set(playW / 2, (BOSS_BAR_TOP + BOSS_BAR_H + 52) * scale);
  }

  /** Shows the sim's boss (if any) and hides the rest, then draws it. */
  draw(b: BossState | null, alpha: number, dt: number, hx: number): void {
    for (const [kind, v] of Object.entries(this.views) as [BossKind, BossLike][]) v.show(!!b && b.kind === kind);
    if (b) this.views[b.kind]?.draw(b, alpha, dt, hx);
    this.badges.set(b && b.phase !== 'down' ? b.affixes : 0, b?.guard ?? 0);
  }

  /** A hit on boss b; the height to show the number at. */
  hit(b: BossState): number {
    return this.views[b.kind]?.hit(b) ?? 0;
  }

  /** The view drawing boss b (the kill cam tints it). */
  viewOf(b: BossState): Container | null {
    return this.views[b.kind]?.view ?? null;
  }

  /** A boss event from the sim, for boss b. */
  react(e: SimEvent, b: BossState): void {
    switch (e.type) {
      case 'bossCast':
        return this.cast(b, e.x / FP, e.y / FP);
      case 'bossDive':
        return this.dive(b, e.x / FP, e.y / FP);
      case 'bossWindup':
        return this.windup(b);
      case 'bossSlam':
        return this.impact(b, e.x / FP, e.y / FP, e.radius / FP);
      case 'bossDown':
        return this.down(b);
      case 'bossBack':
      case 'bossNext':
        return this.back(b);
    }
  }

  dive(b: BossState, x: number, y: number): void {
    if (b.kind === 'carp') this.views.carp?.dive(x, y);
  }

  cast(b: BossState, x: number, y: number): void {
    if (b.kind === 'witch' || b.kind === 'judge' || b.kind === 'demon') this.views[b.kind]?.cast(x, y);
  }

  windup(b: BossState): void {
    this.views[b.kind]?.windup(b);
  }

  impact(b: BossState, x: number, y: number, r: number): void {
    this.views[b.kind]?.impact(x, y, r);
  }

  down(b: BossState): void {
    this.views[b.kind]?.down(b);
  }

  back(b: BossState): void {
    this.views[b.kind]?.back();
  }
}
