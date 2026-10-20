import { isGame, type Game } from './game';

// The privacy policy as each game shows it. The two pages (privacy.en.html, privacy.zh.html) are
// written for Holy Kicker; the corgi's app links `/privacy?g=corgi` and gets the same policy under
// its own name and words, so neither app's policy names the other (docs/ios.md "Second app").

/** The game a page request names (`?g=`), Holy Kicker when none or an unknown one. */
export function pageGame(query: URLSearchParams): Game {
  const g = query.get('g');
  return isGame(g) ? g : 'monk';
}

/** [what Holy Kicker's page says, what the corgi's says], each found exactly once per page. */
const CORGI: Record<'en' | 'zh', [string, string][]> = {
  en: [
    ['<title>Privacy Policy · Holy Kicker</title>', '<title>Privacy Policy · Corgi Commando</title>'],
    ['&nbsp;·&nbsp; Holy Kicker &nbsp;·&nbsp;', '&nbsp;·&nbsp; Corgi Commando &nbsp;·&nbsp;'],
    ['the game Holy Kicker collects', 'the game Corgi Commando collects'],
    ["your monk's level", "your hero's level"],
    ['mode, monk, relic', 'mode, hero, relic'],
    ['<a href="?lang=zh">', '<a href="?g=corgi&amp;lang=zh">'],
  ],
  zh: [
    ['<title>隐私政策 · 蹴鞠僧</title>', '<title>隐私政策 · 柯基突击队</title>'],
    ['蹴鞠僧（Holy Kicker）', '柯基突击队（Corgi Commando）'],
    ['游戏《蹴鞠僧》', '游戏《柯基突击队》'],
    ['武僧等级', '英雄等级'],
    ['模式、武僧、法器', '模式、英雄、法器'],
    ['<a href="?lang=en">', '<a href="?g=corgi&amp;lang=en">'],
  ],
};

/** `page` (Holy Kicker's policy in `lang`) as `game` shows it. */
export function privacyPage(page: string, lang: 'en' | 'zh', game: Game): string {
  if (game === 'monk') return page;
  for (const [from, to] of CORGI[lang]) {
    const n = page.split(from).length - 1;
    if (n !== 1) throw new Error(`privacy.${lang}.html: "${from}" found ${n} times, not once`);
    page = page.replace(from, to);
  }
  return page;
}
