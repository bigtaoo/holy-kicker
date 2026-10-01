import { Container } from 'pixi.js';
import { TaoActor, type TaoAsset } from './tao/TaoActor';

// The hero's animation state: idle/run from movement, with one-shot kick and hurt clips
// layered on top. Hurt interrupts a kick; neither stops the hero from moving.

/** Time into the kick clip when the foot meets the ball (hero_tao.json "kick"). */
const STRIKE_AT = 0.18;
const HURT_FACE = 0.45;

export class Hero {
  /** Positioned in the world; the actor inside it is scaled and mirrored. */
  readonly view = new Container();
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private action: 'kick' | 'hurt' | null = null;
  private struck = false;
  private faceTimer = 0;
  /** -1 facing left (as drawn), 1 facing right. */
  facing = -1;

  constructor(asset: TaoAsset, height: number) {
    this.actor = new TaoActor(asset);
    this.actor.view.scale.set(height / this.actor.height);
    this.actor.play('idle');
    this.body.addChild(this.actor.view);
    this.view.addChild(this.body);
  }

  get busy(): boolean {
    return this.action !== null;
  }

  /** Starts a kick towards dirX's side; false if already kicking or hurt. */
  kick(dirX: number): boolean {
    if (this.action) return false;
    this.action = 'kick';
    this.struck = false;
    if (dirX !== 0) this.facing = Math.sign(dirX);
    this.actor.play('kick', true);
    this.setFace('face_strain', 0.4);
    return true;
  }

  hurt(): void {
    this.action = 'hurt';
    this.actor.play('hurt', true);
    this.setFace('face_hurt', HURT_FACE);
  }

  /** Advances the animation; returns true on the frame the kick strikes. */
  update(dt: number, mx: number, moving: boolean): boolean {
    if (!this.action && mx !== 0) this.facing = mx < 0 ? -1 : 1;
    // The art faces left, so facing right mirrors it.
    this.body.scale.x = -this.facing;
    this.actor.update(dt);

    let strike = false;
    if (this.action === 'kick' && !this.struck && this.actor.elapsed >= STRIKE_AT) {
      this.struck = true;
      strike = true;
    }
    if (this.action && this.actor.finished) this.action = null;
    if (!this.action) this.actor.play(moving ? 'run' : 'idle');

    if (this.faceTimer > 0) {
      this.faceTimer -= dt;
      if (this.faceTimer <= 0) this.actor.setImage('face', null);
    }
    return strike;
  }

  private setFace(image: string, seconds: number): void {
    this.actor.setImage('face', image);
    this.faceTimer = seconds;
  }
}
