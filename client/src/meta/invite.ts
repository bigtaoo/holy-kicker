// A friend's weekly challenge link (docs/design.md "Challenges"): the weekly is the same fixed
// loadout for everyone, so a player can hand a friend their week's best as a target. The link
// carries a short code, `<week id>.<waves>` and, for a run that cleared every wave, `.<tenths>`
// (w2026-45.32, w2026-45.50.8123). The host puts it in its own link (Playgama's `?payload=`, the
// web's `?w=`) and hands it back on the friend's launch. Pure.

/** A friend's week as the link carries it. */
export interface Invite {
  /** The weekly's id (w2026-45). */
  week: string;
  /** Waves the friend cleared. */
  waves: number;
  /** A cleared run's time in tenths of a simulated second, else null. */
  time: number | null;
}

const CODE = /^(w\d{4}-\d{2})\.(\d{1,2})(?:\.(\d{1,6}))?$/;
/** No weekly has more waves than this (server WEEKLY_WAVES is 50). */
const MAX_WAVES = 99;

export function inviteCode(i: Invite): string {
  return `${i.week}.${i.waves}${i.time !== null ? `.${i.time}` : ''}`;
}

/** The invite a code names, or null for anything else (a link typed by hand, another game's payload). */
export function parseInvite(code: string | null | undefined): Invite | null {
  const m = code ? CODE.exec(code.trim()) : null;
  if (!m) return null;
  const waves = Number(m[2]);
  if (waves > MAX_WAVES) return null;
  return { week: m[1], waves, time: m[3] !== undefined ? Number(m[3]) : null };
}

/** The invite for week `week` after a run: the week's best waves, and the run's time when it cleared every wave. */
export function inviteOf(week: string, best: number, time: number | null): Invite {
  return { week, waves: Math.max(0, Math.floor(best)), time };
}
