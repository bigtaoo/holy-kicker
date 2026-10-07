import { Container } from 'pixi.js';
import { TaoActor, type TaoAsset } from './tao/TaoActor';

// The hero's animation: idle/run from movement, with one-shot kick, swing and hurt clips
// layered on top. The sim decides when he kicks, gets hurt and which way he faces; this only
// plays it. While the staff is out his front arm follows it, so he holds it in his hand.

const HURT_FACE = 0.45;
/** Seconds the front arm takes to fall back into the clip once the staff is put away. */
const LET_GO = 0.12;

export class Hero {
  /** Positioned in the world; the actor inside it is scaled and mirrored. */
  readonly view = new Container();
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private action: 'kick' | 'swing' | 'hurt' | null = null;
  private faceTimer = 0;
  private staffAngle: number | null = null;
  private heldAngle = 0;
  private hold = 0;

  constructor(asset: TaoAsset, height: number) {
    this.actor = new TaoActor(asset);
    this.actor.view.scale.set(height / this.actor.height);
    this.actor.play('idle');
    this.body.addChild(this.actor.view);
    this.view.addChild(this.body);
  }

  /** A kick, or with another relic only the strain on his face (staffView, fishView draw it). */
  kick(faceOnly = false): void {
    this.setFace('face_strain', 0.4);
    if (faceOnly) return;
    this.action = 'kick';
    this.actor.play('kick', true);
  }

  /** A staff sweep: he lunges into it (staffView draws the staff, holdStaff() aims his arm). */
  swing(): void {
    this.setFace('face_strain', 0.4);
    this.action = 'swing';
    this.actor.play('swing', true);
  }

  /** The staff's screen angle (radians, y down) while it is out, null once it is put away. */
  holdStaff(angle: number | null): void {
    this.staffAngle = angle;
  }

  /** His front hand, in the view's space, as of the last update. */
  hand(): { x: number; y: number } {
    const p = this.actor.point('hand_f');
    const s = this.actor.view.scale.y;
    return { x: this.body.scale.x * s * p.x, y: s * p.y };
  }

  hurt(): void {
    this.action = 'hurt';
    this.actor.play('hurt', true);
    this.setFace('face_hurt', HURT_FACE);
  }

  /** Advances the animation; `facing` is -1 left (as drawn) or 1 right. */
  update(dt: number, facing: number, moving: boolean): void {
    // The art faces left, so facing right mirrors it.
    this.body.scale.x = -facing;
    if (this.staffAngle !== null) {
      this.heldAngle = this.staffAngle;
      this.hold = 1;
    } else {
      this.hold = Math.max(0, this.hold - dt / LET_GO);
    }
    // the actor is drawn facing left: facing right mirrors the angle too
    const angle = facing > 0 ? Math.PI - this.heldAngle : this.heldAngle;
    this.actor.aim('arm_f_upper', 'hand_f', this.hold > 0 ? angle : null, this.hold);
    this.actor.update(dt);
    if (this.action && this.actor.finished) this.action = null;
    if (!this.action) this.actor.play(moving ? 'run' : 'idle');

    if (this.faceTimer > 0) {
      this.faceTimer -= dt;
      if (this.faceTimer <= 0) this.actor.setImage('face', null);
    }
  }

  private setFace(image: string, seconds: number): void {
    this.actor.setImage('face', image);
    this.faceTimer = seconds;
  }
}
