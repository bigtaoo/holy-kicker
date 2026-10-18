// The weekly challenges picked by hand (docs/design.md "Challenges"), by ISO week id. A week
// listed here plays this loadout; any other week falls back to challenge.ts rotationLoadout.
// Weeks start Monday 00:00 UTC; set a week before it opens (a push to main deploys the server),
// and leave a week alone once it has opened: its runs were checked against the record as it was.
// Ids are the engine's: relics ball, staff, fish, beads, bowl; monks kicker, fat, novice; sutras
// lotus, halo, roar, focus; chapters 1-5. `seed` is optional (else one made from the week).
// challenge.test.ts checks every entry.

export interface WeeklyPick {
  relic: string;
  monk: string;
  sutras: string[];
  chapter: number;
  seed?: number;
}

export const WEEKLIES: Readonly<Record<string, WeeklyPick>> = {
  'w2026-43': { relic: 'bowl', monk: 'fat', sutras: ['lotus', 'roar'], chapter: 2 },
};
