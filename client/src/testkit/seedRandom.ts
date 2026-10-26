/**
 * Every client test starts from the same dice and the same day (vitest setupFiles,
 * vite.config.js), so a test plays the same run on every machine and every day:
 * - Math.random is a seeded generator, reset before each test. Runs started in tests take a
 *   random engine seed (runSetup.ts runSeed) and the views scatter particles with it.
 * - Date starts at the same moment and runs on with real time (timers stay real). The daily and
 *   weekly challenges made on the device come from the day, so the relic, chapter and bosses a
 *   challenge test played changed with the date, and with them the views drawn: client/game's
 *   line coverage moved by about a point from one day to the next, against a ratchet of 0.5.
 * A test that fakes timers itself takes over from here; afterEach hands back the real ones until
 * the next test pins them again.
 */
import { afterEach, beforeEach, vi } from 'vitest';

/** A Wednesday, mid-week and mid-day in every time zone, away from day and week ends. */
export const TEST_NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

/** mulberry32: a small 32-bit generator, plenty for tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pin(): void {
  Math.random = seeded(0x5eed);
  vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW, shouldAdvanceTime: true });
}

// once now, for what a test file works out as it loads (shellWeekly.test.ts's week), then per test
pin();
beforeEach(pin);

afterEach(() => {
  vi.useRealTimers();
});
