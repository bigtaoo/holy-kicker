import { Container, Graphics, type Application } from 'pixi.js';
import { t } from '../i18n';
import { computeViewport } from '../game/viewport';
import type { Insets } from '../platform/types';
import { uiFrame } from './uiLayout';
import { COLORS, label } from './widgets';

// The health advice for games (健康游戏忠告) that a game published in China shows on its launch
// screen: WeChat only, over the screen while the art loads and for at least ADVICE_MIN.

/** The shortest time the advice stays up, in milliseconds, however fast the game loads. */
const ADVICE_MIN = 2000;

/** Shows the advice over the whole screen; `close` takes it down once it has been up long enough. */
export function healthAdvice(app: Application, insets: () => Insets): { close(): void } {
  const layer = new Container();
  const back = new Graphics();
  const view = new Container();
  const text = label(t('boot.healthAdvice'), 48, COLORS.text, { lineHeight: 84 }, false);
  view.addChild(text);
  layer.addChild(back, view);
  const since = performance.now();
  const layout = () => {
    const vp = computeViewport(app.screen.width, app.screen.height);
    back.clear().rect(0, 0, app.screen.width, app.screen.height).fill(COLORS.bg);
    const f = uiFrame(vp, insets());
    view.position.set(f.x + (f.w / 2) * f.scale, f.y + (f.h / 2) * f.scale);
    view.scale.set(f.scale);
    // the shell's first screen comes up under it; stay on top until closed
    if (app.stage.children[app.stage.children.length - 1] !== layer) app.stage.addChild(layer);
  };
  layout();
  app.ticker.add(layout);
  return {
    close() {
      setTimeout(() => {
        app.ticker.remove(layout);
        layer.destroy({ children: true });
      }, Math.max(0, ADVICE_MIN - (performance.now() - since)));
    },
  };
}
