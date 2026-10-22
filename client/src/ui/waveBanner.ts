import { Container } from 'pixi.js';
import { t } from '../i18n';
import { RecordBurstView } from './recordBurstView';
import type { StoryLine } from './story';
import { COLORS, fit, label } from './widgets';

// The banner across the middle of a run (RunHud.announce): its lines top down, the first (the
// wave) white and big, the rest saffron, and under them a story line with who says it.

/** The banner for a frame `w` wide; with `record` the second line is the new-record burst, `age` seconds in. */
export function waveBanner(w: number, lines: readonly [string, number][], story: StoryLine | null, record: boolean, age: number): { box: Container; burst: RecordBurstView | null } {
  const box = new Container();
  let burst: RecordBurstView | null = null;
  let y = 0;
  for (const [i, [text, size]] of lines.entries()) {
    const l = fit(label(text, size, size > 90 ? COLORS.text : COLORS.saffron, { stroke: { color: COLORS.outline, width: 10 } }), w - 80);
    if (i === 1 && record) {
      // the new record: the cheer line pops in over turning rays and a burst of sparks
      burst = new RecordBurstView(l);
      burst.view.y = y;
      burst.update(age);
      box.addChildAt(burst.view, 0);
    } else {
      l.y = y;
      box.addChild(l);
    }
    y += size + 24;
  }
  if (story) {
    const who = label(t(story.who), 48, COLORS.saffron, { stroke: { color: COLORS.outline, width: 8 } });
    who.y = y + 16;
    const say = label(t('story.quote', { text: t(story.say) }), 52, COLORS.text, {
      stroke: { color: COLORS.outline, width: 8 },
      wordWrap: true,
      wordWrapWidth: w - 160,
      breakWords: true,
    });
    say.anchor.set(0.5, 0);
    say.y = who.y + 44;
    box.addChild(who, say);
  }
  box.eventMode = 'none';
  return { box, burst };
}
