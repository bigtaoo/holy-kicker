import type { Application } from 'pixi.js';
import type { DragStick, Vec2 } from '../game/dragStick';
import type { DeviceInfo } from '../game/quality';

// What the game needs from each host (web browser, WeChat mini-game).
// Screen coordinates everywhere are logical pixels, the same units as app.screen.
export interface Platform {
  /** What the host says about the device before any GL context exists (gpu stays ''). */
  probe(): Promise<DeviceInfo>;
  /** MSAA is fixed for the context's lifetime, so it is chosen here. */
  createApp(msaa: boolean): Promise<Application>;
  /** Route touches (and on web, mouse drags) into the stick. */
  bindStick(app: Application, stick: DragStick): void;
  /** Extra movement source such as the keyboard; a zero vector when idle. */
  readKeys(): Vec2;
  /** Reads a text file shipped with the game (relative path, as for textures). */
  readText(path: string): Promise<string>;
}
