import type { Application } from 'pixi.js';
import type { Insets } from '../types';

// Debug builds only (`npm run build:wechat:debug`): a few seconds after boot, writes what
// the game saw to `${wx.env.USER_DATA_PATH}/boot-report.json`. DevTools' console is out of a
// session's reach, but its USER_DATA_PATH is a real folder on this PC, so the simulator run
// can be checked from disk. On a phone the file stays on the phone; the console says it too.

const SECONDS = 5;

export interface BootReport {
  ok: boolean;
  error?: string;
  errors: string[];
  frames: number;
  fps: number;
  screen?: { w: number; h: number; resolution: number };
  insets?: Insets;
  baseLibrary?: string;
  platform?: string;
}

export function watchBoot(): { booted(app: Application, insets: Insets): void; failed(err: unknown): void } {
  const errors: string[] = [];
  wx.onError?.((e) => errors.push(String(e.message ?? e).slice(0, 300)));
  const base = () => ({ errors, baseLibrary: wx.getAppBaseInfo?.().SDKVersion, platform: wx.getDeviceInfo?.().platform });
  return {
    booted(app, insets) {
      let frames = 0;
      const count = () => frames++;
      app.ticker.add(count);
      setTimeout(() => {
        app.ticker.remove(count);
        const screen = { w: app.screen.width, h: app.screen.height, resolution: app.renderer.resolution };
        write({ ok: errors.length === 0, frames, fps: Math.round(frames / SECONDS), screen, insets, ...base() });
      }, SECONDS * 1000);
    },
    failed(err) {
      write({ ok: false, error: String(err), frames: 0, fps: 0, ...base() });
    },
  };
}

function write(report: BootReport): void {
  const json = JSON.stringify(report, null, 2);
  console.info('[holy-kicker] boot report', json);
  try {
    const dir = wx.env?.USER_DATA_PATH;
    if (dir) wx.getFileSystemManager().writeFileSync(`${dir}/boot-report.json`, json, 'utf8');
  } catch (err) {
    console.warn('[holy-kicker] boot report not written', err);
  }
}
