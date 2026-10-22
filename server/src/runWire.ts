// Event fields for the run's shape, the ad funnel and the experiments (docs/experiments.md),
// beside protocol.ts's event list.

/**
 * The build a `run_end` carries (builds from engine 49 on): `spells` and `passives` as
 * comma-joined id + level, a spell's `+` when evolved (`palm5+,bolt3`, `eye2,rice1`, empty for
 * none); `relicLv` 1..5 and `awakened`; `moving`, the percent of the hero's ticks up spent moving;
 * `travel`, world units walked per kill (none without kills). Kiting runs move almost all the
 * time and walk far per kill.
 *
 * `run_start` and `run_end` also carry `waves`, the run's own length (builds before it sent none,
 * and every run then had LIMITS.waves). A won run clears its chapter only when it was that long:
 * a shorter run (an experiment's first run) counts as a win of its own and never as a clear.
 */
export const RUN_BUILD = {
  spells: /^(?:[a-z]{2,12}[1-5]\+?(?:,[a-z]{2,12}[1-5]\+?){0,3})?$/,
  passives: /^(?:[a-z]{2,12}[1-5](?:,[a-z]{2,12}[1-5]){0,3})?$/,
  maxTravel: 100_000,
} as const;

/**
 * Where a rewarded ad is offered. `offer` has `at` (one of these) and `outcome`: `shown` when the
 * offer is drawn with an ad ready (once per screen it is drawn on), `nofill` when the offer's place
 * came up and no ad was ready, `taken` when the player tapped it and the ad paid, `failed` when it
 * was tapped and paid nothing (closed early, an error). Declined is shown less taken and failed.
 * The rewarded `ad` event's `at` names the same places; builds before it sent `lobby` for all
 * three lobby offers.
 */
export const OFFER_PLACES = ['lobby_chest', 'patrol_double', 'patrol_quick', 'revive', 'double', 'challenge_double'] as const;
export type OfferPlace = (typeof OFFER_PLACES)[number];
export const OFFER_OUTCOMES = ['shown', 'nofill', 'taken', 'failed'] as const;
export type OfferOutcome = (typeof OFFER_OUTCOMES)[number];

/**
 * An interstitial shown is an `ad` with `kind: 'inter'` and `at`: one of these, the button that
 * led to it. A rewarded `ad` has no `kind`.
 */
export const INTER_PLACES = ['results_next', 'results_lobby', 'challenge_next'] as const;
export type InterPlace = (typeof INTER_PLACES)[number];

/** An experiment's id or one of its arms' names. */
export const EXP_NAME = /^[a-z0-9_]{1,16}$/;
/** The most experiments one install is tagged with. */
export const MAX_EXPERIMENTS = 4;
/** An EventBatch's `exp`: the install's `id:arm` pairs, comma-separated. */
export const EXP_TAG = /^[a-z0-9_]{1,16}:[a-z0-9_]{1,16}(?:,[a-z0-9_]{1,16}:[a-z0-9_]{1,16}){0,3}$/;

/** The `exp` tag for these arms (experiment id → arm, '' for not enrolled), sorted; '' for none. */
export function expTag(arms: Readonly<Record<string, string>>): string {
  return Object.keys(arms)
    .filter((id) => EXP_NAME.test(id) && EXP_NAME.test(arms[id]))
    .sort()
    .slice(0, MAX_EXPERIMENTS)
    .map((id) => `${id}:${arms[id]}`)
    .join(',');
}

/** The `id:arm` pairs of a valid `exp` tag. */
export function expPairs(tag: string | undefined): string[] {
  return tag && EXP_TAG.test(tag) ? tag.split(',') : [];
}
