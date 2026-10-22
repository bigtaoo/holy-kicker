import { Container } from 'pixi.js';
import { t } from '../i18n';
import type { CloudUi } from '../net/cloudSync';
import { COLORS, button, label } from './widgets';

// The settings panel's cloud save rows (docs/cloud-save.md "A slot and its restore code"):
// Back up (then the restore code, which copies itself when tapped) beside Restore, and a line
// under them saying how the last try went. The rows redraw themselves as the sync answers.

/** The buttons and two lines of the hint. */
const HEIGHT = 110 + 20 + 2 * 60 + 30;

/** The rows, `width` wide and `height` tall (centred on the view) whatever they say, so the panel never moves. */
export function cloudRows(cloud: CloudUi, width: number): { view: Container; height: number } {
  const view = new Container();
  const bw = (width - 24) / 2;
  const style = { wordWrap: true, wordWrapWidth: width, breakWords: true, align: 'center' as const };
  const draw = () => {
    for (const c of view.removeChildren()) c.destroy({ children: true });
    const code = cloud.code();
    const busy = cloud.busy();
    const left = code
      ? button(code, bw, 110, () => cloud.copy?.(), { fill: COLORS.panelLocked, size: 48 })
      : button(t('cloud.backup'), bw, 110, () => !busy && cloud.backup(), { fill: COLORS.saffron, textFill: COLORS.outline, size: 48 });
    const right = button(t('cloud.restore'), bw, 110, () => !busy && cloud.restore(), { fill: COLORS.panelLocked, size: 48 });
    left.position.set(-(bw + 24) / 2, -HEIGHT / 2 + 55);
    right.position.set((bw + 24) / 2, -HEIGHT / 2 + 55);
    const status = cloud.status();
    const line = label(status ? t(`cloud.${status}`) : t(code ? 'cloud.hintCode' : 'cloud.hint'), 48, status === 'failed' || status === 'badCode' || status === 'noSlot' ? COLORS.text : COLORS.dim, style);
    line.y = -HEIGHT / 2 + 110 + 20 + line.height / 2;
    view.addChild(left, right, line);
  };
  draw();
  // after the tap that started it: a button is not destroyed under its own handler
  const stop = cloud.listen(() => void Promise.resolve().then(() => !view.destroyed && draw()));
  view.on('destroyed', stop);
  return { view, height: HEIGHT };
}
