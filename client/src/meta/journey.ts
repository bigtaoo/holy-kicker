import { playChapter, type RunStats } from '@hk/engine/bot/balance';
import type { BotStyle } from '@hk/engine/bot/bot';
import { BALANCE } from './balance';
import { bump, claimBonus, claimTask, rollDay } from './daily';
import { mergeAll } from './gear';
import { loadout } from './loadout';
import { collectPatrol, patrolOpen, quickLeft, quickPatrol, startPatrol } from './patrol';
import { bestChapter, doubleCopper, earnedSutras, frontier, settleRun } from './progress';
import { newSave, type SaveData } from './save';
import { chestBlock, chestsLeft, openChest } from './shop';
import { train } from './training';

// A dev tool, not shipped: a whole player journey through the meta game (`npm run journey`,
// build/journey.mjs). A bot plays every run with the stats its save gives it, and between runs
// the player does what the lobby offers: merges, trains, opens the shop's chests, collects the
// patrol and claims the daily tasks. It tells how many days and runs each chapter takes and
// what the gear is worth when it falls, which the chapter balance is checked against, and the
// stars: each session gives `stars` runs to the first cleared chapter still short of three (all of
// them once every chapter is cleared), so it tells when each chapter's hard mode opens. The bot
// plays without revives, so a clear's stars come from its lowest health alone.

export interface JourneyPlan {
  style: BotStyle;
  /** Two sessions a day, 12 hours apart; this many runs in each. */
  runsPerSession: number;
  /** Watches every rewarded ad on offer. */
  ads: boolean;
  days: number;
  seed: number;
  /** Uses the patrol, the shop and the daily tasks (false: runs, merging and training only). */
  lobby: boolean;
  /** Runs a session spends replaying a cleared chapter for its stars, while the frontier is open. */
  stars: number;
}

export interface ChapterClear {
  chapter: number;
  hard: boolean;
  day: number;
  runs: number;
  /** Runs played on this chapter, and the waves each reached. */
  tries: number[];
  /** The clear's stars. */
  stars: number;
  bonus: string;
  trained: number;
  gear: string;
}

/** A chapter's third star, which opens its hard mode. */
export interface ThreeStars {
  chapter: number;
  day: number;
  runs: number;
  /** Runs played on the chapter since its first clear, and the stars each earned. */
  tries: number[];
}

export interface Journey {
  clears: ChapterClear[];
  threeStars: ThreeStars[];
}

const HOUR = 3600 * 1000;

/** A seeded [0, 1) source, so a journey replays. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spends what the lobby lets spend: merges first, then training, then jade on the jade chest. */
function spend(s: SaveData, now: number, plan: JourneyPlan, rand: () => number): SaveData {
  s = mergeAll(s).save;
  for (let next = train(s); next !== s; next = train(s)) s = next;
  while (plan.lobby && patrolOpen(s) && !chestBlock(s, now, 'jade')) s = openChest(s, now, 'jade', rand)!.save;
  return mergeAll(s).save;
}

/** The lobby between runs at the start of a session: patrol, chests, quick patrols. */
function lobby(s: SaveData, now: number, plan: JourneyPlan, rand: () => number): SaveData {
  s = startPatrol(rollDay(s, now), now);
  if (!plan.lobby || !patrolOpen(s)) return s;
  s = collectPatrol(s, now, plan.ads, rand)?.save ?? s;
  if (chestsLeft(s, now, 'free')) s = openChest(s, now, 'free', rand)?.save ?? s;
  if (plan.ads) {
    while (chestsLeft(s, now, 'ad')) s = openChest(s, now, 'ad', rand)?.save ?? s;
    while (quickLeft(s, now, 'ad') > 0) s = quickPatrol(s, now, 'ad', rand)!.save;
  }
  return s;
}

function claimAll(s: SaveData, now: number): SaveData {
  BALANCE.daily.tasks.forEach((_, i) => (s = claimTask(s, now, i)));
  return claimBonus(s, now);
}

function describe(s: SaveData): { bonus: string; gear: string } {
  const bonus = Object.entries(loadout(s).bonus).map(([k, v]) => `${k}:${v}`).join(',');
  const gear = Object.entries(s.gear).map(([id, n]) => `${id}${n.map((c) => c || '.').join('')}`).join(' ');
  return { bonus, gear };
}

/** The first cleared chapter short of three stars, or null. */
function starChase(s: SaveData): number | null {
  for (let c = 1; c <= s.cleared; c++) if ((s.stars[c - 1] ?? 0) < 3) return c;
  return null;
}

/** The chapter run r of a session plays: the star chase first, then the frontier. */
function nextChapter(s: SaveData, r: number, plan: JourneyPlan): number | null {
  const chase = starChase(s);
  const open = frontier(s);
  if (chase !== null && (open === null || r < plan.stars)) return chase;
  return open;
}

export function journey(plan: JourneyPlan, log: (line: string) => void = () => {}): Journey {
  const rand = mulberry(plan.seed);
  let s = newSave();
  let now = new Date(2026, 9, 5, 8).getTime();
  let runs = 0;
  let tries: number[] = [];
  const replays = new Map<number, number[]>();
  const clears: ChapterClear[] = [];
  const threeStars: ThreeStars[] = [];
  const more = () => nextChapter(s, 0, plan) !== null;
  for (let day = 1; day <= plan.days && more(); day++) {
    for (let session = 0; session < 2 && more(); session++) {
      s = spend(lobby(s, now, plan, rand), now, plan, rand);
      for (let r = 0; r < plan.runsPerSession && more(); r++) {
        const chapter = nextChapter(s, r, plan)!;
        const hard = false;
        const st: RunStats = playChapter(
          plan.seed * 1000 + runs, plan.style, BALANCE.waves, 30, s.relic, earnedSutras(s), chapter, loadout(s).bonus, hard,
        );
        const waves = st.outcome === 'won' ? BALANCE.waves : st.wave - 1;
        runs++;
        const replay = chapter <= s.cleared;
        if (!replay) tries.push(waves);
        const settled = settleRun(s, { chapter, hard, waves, lowest: st.lowest, revived: false }, rand);
        s = plan.ads ? doubleCopper(settled.save, settled.reward) : settled.save;
        s = bump(bump(bump(s, now, 'runs', 1), now, 'waves', waves), now, 'kills', st.kills);
        s = spend(plan.lobby ? claimAll(s, now) : s, now, plan, rand);
        const { stars } = settled.reward;
        if (settled.reward.firstClear) {
          clears.push({ chapter, hard, day, runs, tries, stars, trained: s.trained, ...describe(s) });
          log(`ch${chapter} cleared on day ${day} after ${runs} runs (${tries.length} on it: ${tries.join(' ')}), ${stars} stars`);
          tries = [];
          replays.set(chapter, []);
        } else if (replay) replays.get(chapter)?.push(stars);
        if (settled.reward.hardUnlocked) {
          const on = replays.get(chapter) ?? [];
          threeStars.push({ chapter, day, runs, tries: on });
          log(`ch${chapter} three stars on day ${day} after ${runs} runs (${on.length} replays: ${on.join(' ')}): hard opens`);
        }
        now += 15 * 60 * 1000;
      }
      now += 12 * HOUR - plan.runsPerSession * 15 * 60 * 1000;
    }
    const d = describe(s);
    log(`day ${day}: best ch${bestChapter(s)}, ${runs} runs, copper ${s.copper}, jade ${s.jade}, trained ${s.trained} | ${d.bonus}`);
  }
  return { clears, threeStars };
}
