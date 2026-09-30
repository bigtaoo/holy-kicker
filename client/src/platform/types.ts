import type { Application } from 'pixi.js';
import type { DragStick, Vec2 } from '../game/dragStick';

// What the game needs from each host (web browser, WeChat mini-game).
// Screen coordinates everywhere are logical pixels, the same units as app.screen.
export interface Platform {
  createApp(): Promise<Application>;
  /** Route touches (and on web, mouse drags) into the stick. */
  bindStick(app: Application, stick: DragStick): void;
  /** Extra movement source such as the keyboard; a zero vector when idle. */
  readKeys(): Vec2;
}
