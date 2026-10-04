import type { Container } from 'pixi.js';
import type { Boss as BossState, BossKind } from '@hk/engine';
import type { Boss } from './bossView';
import type { CarpView } from './carpView';
import type { WitchView } from './witchView';

// The chapter's boss views by kind: the abbot's rig, the Black Carp King and the Bone Witch,
// each the boss of its chapter and, empowered, the mid-boss of the next. The sim has one boss
// at a time; the stage sends its events and drawing to that kind's view and keeps the others
// hidden.

export interface BossViews {
  abbot?: Boss;
  carp?: CarpView;
  witch?: WitchView;
}

type BossLike = Boss | CarpView | WitchView;

export class BossStage {
  private readonly all: BossLike[];

  constructor(private readonly views: BossViews) {
    this.all = Object.values(views) as BossLike[];
  }

  /** The views' bars, to add to the screen. */
  get huds(): Container[] {
    return this.all.map((v) => v.hud);
  }

  /** Draws the bosses over the horde, at z. */
  setZ(z: number): void {
    for (const v of this.all) v.view.zIndex = z;
  }

  layout(playW: number, scale: number): void {
    for (const v of this.all) v.layout(playW, scale);
  }

  /** Shows the sim's boss (if any) and hides the rest, then draws it. */
  draw(b: BossState | null, alpha: number, dt: number, hx: number): void {
    for (const [kind, v] of Object.entries(this.views) as [BossKind, BossLike][]) v.show(!!b && b.kind === kind);
    if (b) this.views[b.kind]?.draw(b, alpha, dt, hx);
  }

  /** A hit on boss b; the height to show the number at. */
  hit(b: BossState): number {
    return this.views[b.kind]?.hit(b) ?? 0;
  }

  dive(b: BossState, x: number, y: number): void {
    if (b.kind === 'carp') this.views.carp?.dive(x, y);
  }

  cast(b: BossState, x: number, y: number): void {
    if (b.kind === 'witch') this.views.witch?.cast(x, y);
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
