import type { Container } from 'pixi.js';
import type { RelicId, SimState } from '@hk/engine';
import { THEME } from '../theme';
import type { CorgiMoment } from './corgiFace';
import { CorgiHero } from './corgiHero';
import { Hero } from './hero';
import type { TaoAsset } from './tao/TaoActor';

// The hero's view as the run drives it, whichever art set the build ships: the monks (hero.ts)
// or the corgi (corgiHero.ts). A monk rig still plays as a monk under the corgi theme while
// that hero's art is not drawn (dev:new falls back to the monk files).

export interface HeroView {
  /** Positioned in the world. */
  readonly view: Container;
  /** What the hero holds out (the wooden fish), behind the body. */
  readonly held: Container;
  attack(relic: RelicId): void;
  swing(): void;
  holdStaff(angle: number | null): void;
  /** A hand (or the corgi's raised muzzle), in the view's space, as of the last update. */
  hand(bone?: string): { x: number; y: number };
  hurt(): void;
  /** A moment the face shows (the corgi's; the monks have no such faces). */
  cheer?(moment: CorgiMoment): void;
  /** Advances the animation; `facing` is -1 left or 1 right; `s` and `alpha` place what the hero aims at. */
  update(dt: number, facing: number, moving: boolean, s: SimState, alpha: number): void;
}

export function makeHero(rig: TaoAsset, height: number): HeroView {
  return THEME === 'corgi' && CorgiHero.fits(rig) ? new CorgiHero(rig, height) : new Hero(rig, height);
}
