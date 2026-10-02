import { Container } from 'pixi.js';
import { TaoActor, type TaoAsset } from './tao/TaoActor';

// The hero's animation: idle/run from movement, with one-shot kick and hurt clips layered on
// top. The sim decides when he kicks, gets hurt and which way he faces; this only plays it.

const HURT_FACE = 0.45;

export class Hero {
  /** Positioned in the world; the actor inside it is scaled and mirrored. */
  readonly view = new Container();
  private readonly actor: TaoActor;
  private readonly body = new Container();
  private action: 'kick' | 'hurt' | null = null;
  private faceTimer = 0;

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

  hurt(): void {
    this.action = 'hurt';
    this.actor.play('hurt', true);
    this.setFace('face_hurt', HURT_FACE);
  }

  /** Advances the animation; `facing` is -1 left (as drawn) or 1 right. */
  update(dt: number, facing: number, moving: boolean): void {
    // The art faces left, so facing right mirrors it.
    this.body.scale.x = -facing;
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
