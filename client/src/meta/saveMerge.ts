import { mergeCodex } from './codex';
import { readSave, type SaveData } from './save';

// Two saves of the same player into one (docs/cloud-save.md "Merging two saves"): the cloud
// save's copy and this device's. Progress takes the furthest of the two field by field, so a
// sync never loses a clear, a star or a run; what cannot be added up (the wallet, the gear, the
// selections, today's tasks, fields this build does not know) follows the save that played more.

/** Whether `a` has played further than `b`: more runs, then more clears, then level and xp. */
function ahead(a: SaveData, b: SaveData): boolean {
  if (a.runs !== b.runs) return a.runs > b.runs;
  if (a.cleared !== b.cleared) return a.cleared > b.cleared;
  if (a.level !== b.level) return a.level > b.level;
  return a.xp > b.xp;
}

/** The save the other fields come from: `other` only when it is ahead (a tie keeps `mine`). */
export function leaderOf(mine: SaveData, other: SaveData): 'mine' | 'other' {
  return ahead(other, mine) ? 'other' : 'mine';
}

const most = (a: readonly number[], b: readonly number[]) => a.map((v, i) => Math.max(v, b[i] ?? 0));
const either = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v | (b[i] ?? 0));
const earliest = (a: number, b: number) => (a && b ? Math.min(a, b) : a || b);
/** Per chapter the faster of two clear times, 0 (none) losing to any time. */
const fastest = (a: readonly number[], b: readonly number[]) => a.map((v, i) => earliest(v, b[i] ?? 0));
/** The streak of the save that played the daily last; the same day keeps the longer one. */
const streakOf = (a: SaveData, b: SaveData) => (b.streakDay > a.streakDay || (b.streakDay === a.streakDay && b.streak > a.streak) ? b : a);
/** The later daily's best (ids sort by date); the same daily keeps the more waves. */
const dailyOf = (a: SaveData['dailyBest'], b: SaveData['dailyBest']) => (b.id > a.id || (b.id === a.id && b.waves > a.waves) ? b : a);

/** `mine` and `other` merged; the result reads as a valid save of this build (readSave). */
export function mergeSaves(mine: SaveData, other: SaveData): SaveData {
  const lead = leaderOf(mine, other) === 'mine' ? mine : other;
  const trail = lead === mine ? other : mine;
  const higher = trail.level > lead.level || (trail.level === lead.level && trail.xp > lead.xp) ? trail : lead;
  const gifted = trail.gifts > lead.gifts ? trail : lead;
  const streaked = streakOf(lead, trail);
  const merged: SaveData = {
    ...lead,
    firstRunDone: lead.firstRunDone || trail.firstRunDone,
    level: higher.level,
    xp: higher.xp,
    cleared: Math.max(lead.cleared, trail.cleared),
    best: most(lead.best, trail.best),
    stars: most(lead.stars, trail.stars),
    hardBest: most(lead.hardBest, trail.hardBest),
    hardStars: most(lead.hardStars, trail.hardStars),
    chests: either(lead.chests, trail.chests),
    opened: either(lead.opened, trail.opened),
    hardChests: either(lead.hardChests, trail.hardChests),
    hardOpened: either(lead.hardOpened, trail.hardOpened),
    times: fastest(lead.times, trail.times),
    hardTimes: fastest(lead.hardTimes, trail.hardTimes),
    runs: Math.max(lead.runs, trail.runs),
    kills: Math.max(lead.kills, trail.kills),
    trained: Math.max(lead.trained, trail.trained),
    codex: mergeCodex(lead.codex, trail.codex),
    seen: lead.seen | trail.seen,
    monks: lead.monks | trail.monks,
    achieved: either(lead.achieved, trail.achieved),
    gifts: gifted.gifts,
    giftDay: lead.gifts === trail.gifts ? Math.max(lead.giftDay, trail.giftDay) : gifted.giftDay,
    firstDay: earliest(lead.firstDay, trail.firstDay),
    dice: lead.dice || trail.dice,
    streak: streaked.streak,
    streakDay: streaked.streakDay,
    bestStreak: Math.max(lead.bestStreak, trail.bestStreak),
    dailyBest: dailyOf(lead.dailyBest, trail.dailyBest),
    // an experiment the save that played more was offered keeps its arm; one only the other was offered comes along
    arms: { ...trail.arms, ...lead.arms },
    tester: lead.tester || trail.tester,
  };
  // the same checks as a stored save: relics the clears unlock are owned, the shown chapter is open
  return readSave(JSON.parse(JSON.stringify(merged)) as Record<string, unknown>);
}
