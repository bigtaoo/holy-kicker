# Reskin: corgi space marines vs the bug swarm

A second game on the same engine and the same rules, aimed at CrazyGames' broad audience. The
monk theme reads as niche on the Horde Survival shelf; the bright hits there are cute shooters. The
gameplay, balance and every behaviour stay the same; only names, art, sounds and story change.

Concept art: `art/reskin/r1/` (cover candidates, the corgi was picked), `art/reskin/r2/`
(`sheet.jpg` is the overview: cover, heroes, mobs, elites, bosses). Keepers: `heroes.png`,
`mobs3.png` (the bug language: real insect bodies, not humanoid), the slime, gnats and shield
beetle in `mobs2.png`, `elites2.png`, the middle beetle of `bosses_a.png` (Titan Beetle),
`boss_worm.png`, `boss_queen.png`, `bosses_b.png`. `mobs.png`, `elites.png` and `bosses.png`
drifted into humanoid robots or warm colours. A sheet of several creatures tends to repeat one
design, so each role gets its own picture in production. The art rules in CLAUDE.md still hold: hero warm (orange, gold,
cream), enemies cold (teal, purple, grey) with red eyes, thick outlines, flat colours, one hard
cel shadow.

Title: **Corgi Commando**, in Chinese **柯基突击队** (decided 2026-10-20; no game of that name
found on the App Store or itch.io). On iOS it ships as its own app:
- the store name is **Corgi Commando: Bug Blaster** (27 of 30 characters; "bug" and "blaster" are
  search words);
- the home-screen name (`CFBundleDisplayName`) is **Commando**, since "Corgi Commando" is about
  95 pt wide at the label's 12 pt and gets cut to "Corgi Comma…" (Holy Kicker is about 60 pt);
- the corgi on the icon supplies the rest; the Chinese home-screen name is the full 柯基突击队,
  which fits.
The iOS app's plumbing (bundle id `com.gamestao.corgi`, its workflows and the owner's steps) is in
docs/ios.md "Second app: Corgi Commando".

## Heroes

The squad wears matching white armour with an open helmet and dark gunmetal pistols, so the
warm colour stays on the fur (and the bulldog's gold belly plate). Each keeps its monk's stats
and passive.

**Armour colour**: the drawings have orange plates, which made each hero one orange block. The
parts specs repaint them as the parts are cut (`"recolor"` in each `parts_spec.json`,
`tools/recolor_armour.py`): the saturated orange of the body parts turns off-white and the guns'
orange turns gunmetal; the cream, the glow, the undersuit and the fur parts keep their colour.
The gun icons (`ball`, `bowl`) take the same gunmetal as `tools/corgi_art.py icons` packs them; the blaster's slots, button and muzzle ring glow in the pistols' yellow-green (regions in `GUN_ICONS`), and the sheet white left inside both trigger guards is cleared, since the dark HUD showed it. The icon sheet's shared 256-colour palette has no entry at the pistols' hue 60, so the glow lands on its nearest yellow (hue 55); a hue past ~75 snaps to lime instead.
Dark grey and navy were tried and lost the body on the dark planets and sat next to the bugs'
blue-greys; white reads on every ground. Changing the paint means re-running the whole chain:
`split_parts.py`, `pack_tao.py` (and `webp.py` for the corgi) and the portraits (below, "Squad
rigs").

| Monk | Hero | Look | Stats / passive |
|---|---|---|---|
| kicker | **Biscuit**, corgi | chubby, big grin, ears up, twin blaster pistols | baseline |
| fat | **Brick**, bulldog | heavy plates, round belly plate, grumpy-friendly | HP +50%, speed −15%; *Belly Bounce* knocks back what hits him |
| novice | **Ginger**, tabby cat | light armour, scarf, sly smile | HP −30%, speed +20%, XP +15%; *Light Feet* dodges while moving |

## Weapons (relics)

| Relic | Weapon | Behaviour (unchanged) | Evolution |
|---|---|---|---|
| ball | Ricochet Blaster | bouncing shot | Star Breaker |
| staff | Plasma Saber | sweep | Twin Saber |
| fish | Pulse Emitter | ring | Shock Core |
| beads | Orbit Drones | orbit | Drone Swarm |
| bowl | Disc Launcher | boomerang | Saw Storm |

## Spells and passives

| Spell | New | Behaviour |
|---|---|---|
| palm | Orbital Strike | meteor slam |
| bolt | Tesla Coil | chain lightning |
| incense | Plasma Puddle | damage field at the feet |
| bell | Bubble Shield | shield, then nova |
| cymbal | Saw Blade | piercing star |
| lotus (sutra) | Proximity Mines | mines |
| halo (sutra) | Laser Turret | rotating beam |
| roar (sutra) | Mega Bark | knockback cone |

Effects that are sprites follow the asset list like any art. The ones drawn in code (Pixi
`Graphics` baked to textures) take the corgi's look from `client/src/game/corgiFx.ts` when
`THEME` is corgi, with the same sizes, timings and layers. The palette is orange metal, grey
steel and cyan glass, taken from the corgi's icons. Each view keeps Holy Kicker's drawing in its
monk branch, and no build mixes the two:

| Monk effect | Corgi effect |
|---|---|
| Mountain Palm print | scorched crater with a crosshair |
| incense ring (green healing field) | orange plasma puddle (cyan repair pool with a cross) |
| Golden Bell dome, gold nova | cyan energy bubble (glows at its rim, clear inside), pale cyan nova |
| cymbals, gold wheel track | steel saw blades, orange track |
| gold lightning | cyan tesla arcs |
| lotus seeds | mines: orange dome, cyan dome when they pull (Magnet Mines) |
| halo beams, roar waves | orange-red laser, white waves |
| beads | orange drones, steel ones in the second ring; cyan orbit cord |
| bowl | striped orange disc, steel and cyan for the Saw Storm |
| wooden fish ring | cyan pulse |
| staff trail | orange trail, pale gold and white once evolved |
| zen lotus at rest | orange targeting reticle (4 inward markers) |

| Passive | New | Effect |
|---|---|---|
| calm | Coolant | spell cooldown − |
| iron | Plating | max health + |
| legs | Jet Boots | move speed + |
| eye | Wide Lens | spell area + |
| rice | Kibble | heal per second |
| wrath | Scope | crit chance + |
| karma | Treat Magnet | XP +, pickup range + |
| focus | Battery | spell duration +, guard after a hit + |

## Enemies

All bugs: cold colours, red eyes, cute-menacing, no gore (they pop into teal goo splats).

| Kind | Bug | Behaviour (unchanged) |
|---|---|---|
| chaser | Beetle Drone | walks at the hero |
| runner | Skitter Tick | fast, low HP |
| swarm | Gnat | dies to any hit (procedural, like the wisps) |
| emerger | Burrow Worm | burrows, pops up next to the hero |
| shooter | Spitter | stops at range, 3-shot acid fan |
| wolf | Mantis | fast pack |
| caster | Psy-Jelly | psychic circle under the hero (was frost) |
| skeleton | Shell Bug | splits into two grubs |
| effigy | Slime | splits into two slimelets |
| monk | Shield Beetle | blocks 3 frontal hits |

| Elite | Bug | Behaviour |
|---|---|---|
| charger | Ram Beetle | telegraphed lane dash |
| toadKing | Brood Mother | 5-shot fan plus acid pools |
| wolfLeader | Alpha Mantis | charge, or a screech that hastes nearby bugs |
| doorGod | Fortress Crab | front shield plus a claw smash |

## Bosses and planets

| Ch | Was | Planet | Boss | Behaviour |
|---|---|---|---|---|
| 1 | Ruined Temple | Frost Moon (the cover's ice planet) | Titan Beetle | slam |
| 2 | Misty Marsh | Spore Jungle | Bog Worm | dives, surfaces with a bullet ring |
| 3 | Snow Pass | Dune World | Hive Queen | summons grubs, spine fan |
| 4 | Ghost Market | Magma Forge | Overmind (brain in a dome) | zone lines and psychic fans |
| 5 | Demon Peak | Hive Core | Mecha-Biscuit (evil cyborg twin) | dark copy of the hero |

Mid-bosses keep their pattern: chapter 1 is two Ram Beetles, later chapters the previous boss
empowered. Planet grounds may use warm colours (magma, dunes); the bugs on them stay cold.

## Meta

| Was | New |
|---|---|
| copper | Bolts |
| jade | Gems |
| gear: relic, pendant, bracers, robe, sash, sandals | weapon, dog tag, gauntlets, armour, utility belt, boots |
| training | Boot Camp |
| tiers Common … Sacred | Common … Legendary |

## Animation

Today (Holy Kicker): the monks are a 20-bone cutout rig (`client/src/game/tao/`) with seven
hand-keyed clips in `art/monk/rig/hero_tao.json` (idle, run and five attacks), a whole-body mirror
flip, one aimed arm and face swaps. Mobs are one warped loop each (`tools/bake_mob.py`, 8–12
frames), plus a white flash and a corpse that tips over. Only the abbot is rigged among the
bosses. What makes it stiff: no lean, no follow-through, no overlap, an instant turn, no death or
spawn motion for anything but the hero, and every bug moving the same wobble.

The reskin keeps the split (rigged hero and bosses, baked mobs) but adds the layers that make
motion read as alive. All of it is view-side; the engine is untouched.

### Hero (corgi, bulldog, cat)

- **Layered clips**: legs play run or idle while fire plays on top, additive or by bone mask
  (`TaoActor.layer`).
- **Twin pistols, no mirror**: turns come so often in a horde game that a mirror flip makes the
  screen shake, so the body never flips. Each paw holds a pistol, carried at the side (the
  clips' pose) until an attack: the gun on the aim's side comes up in 0.08 s, stays up 0.6 s
  after the last attack and goes back down over 0.25 s; aiming the other way swaps guns with a
  short blend and a dead zone so the aim does not flicker it. The raised arm and then its gun aim
  at the target (`TaoActor.aim`, weighted by the raise and the swap), the head follows part of
  the way. Each gun reaches past vertical, so shots go straight up and down; the arm stops at 55°
  and the wrist turns the rest, so a gun aimed up stays beside the head.
- **Bent arms**: the corgi's arms have elbows (`fore_f`, `fore_n` between the upper arm and the
  gun), so the carry is a bent arm with the gun at the hip, as in the character sheet, instead of
  a straight arm hanging at 65°; in the trot the forearms swing a beat after the upper arms.
  Aiming straightens the elbow (`TaoActor.aim` brings the bones between the arm and the gun to
  zero by its weight), so the aiming code is the same with or without elbows. The bulldog and
  the cat have the same elbows.
- **Faces**: like the monk, the head swaps drawings (`corgiFace.ts`, tested): a battle cry as a
  gun goes off, a wince on a hit (the wince wins), and otherwise the smile with a blink, sometimes
  a double, every few seconds. The bulldog and the cat carry the same three faces; the view
  shows only the variants a rig has.
- **Calm by default**: the hero is on screen the whole run and the camera follows it, so every
  motion is small: a step of 4% of the height, a 2% bob and 3.5° roll in the trot, a 3° lean,
  a 4° kick per shot. Big swings read as shaking.
- **Front-view trot**: the run faces the camera (each foot lifts in turn while the body rises,
  rolls and shifts over the other, the head counter-rolls an eighth of a cycle late, the arms
  swing a little), so it plays forwards whichever way the hero goes, at 0.75–1.2x as the ground
  speed rises.
- **Procedural life**: lean into acceleration, squash on each footfall, breathing.
- **Springs** (secondary motion): ears, tail, cheeks or belly, backpack antenna, the cat's scarf,
  each a damped spring driven by the root's acceleration. Cheap, and the main source of
  "natural".
- **Weapon motion**: recoil kick per shot (arm and body), muzzle flash, ejected casings; saber
  swing, ground pound (pulse), throw (disc) mapped from today's swing, knock and throw.
- **Hurt**: a hit layers `hurt` on top (the body squashes, the head tips, a small rebound) in
  0.3 s, whatever the hero is doing.
- **New clips**: spawn (drop-pod landing), dash/dodge (the cat's *Light Feet*), belly bounce
  (bulldog), a helmet wobble on hurt, death (flops over, helmet rolls off), level-up cheer,
  victory, and lobby idles (scratch an ear, wag, yawn, check the gun).

**Prototype** (dev only): `client/proto.html` (`/proto.html` on the dev server, driven by
`src/dev/corgiProto.ts`) plays the corgi rig with the game's motion (`corgiMotion.ts`) and all of
the above except the new clips; H plays a hit. The clips (idle, run, fire_l, fire_r,
hurt) come from `python tools/hero_clips.py`, which writes the set into the corgi's, the
bulldog's and the cat's specs, the bent-arm carry for a rig with elbows and the straight-armed one
otherwise (its parameters, such as the step's height, can be overridden on the command line);
repack each rig after it.
The rig comes from `art/reskin/corgi/`: `python tools/split_parts.py art/reskin/corgi/parts_spec.json
art/reskin/corgi/parts`, then `python tools/pack_tao.py art/reskin/corgi/corgi_tao.json
art/reskin/corgi/corgi.tao art/reskin/corgi/runtime`. The split works from `apose2.png`, the
corgi redrawn (by image edit) with both arms held out, so no limb crosses the body; the clips hang
the near arm down. The spec claims each pixel for the frontmost part (`exclusive`), fills the
areas behind other parts with flat colour plus round joint caps instead of inpainting, lets each
part reach a few px under the parts in front (`overlap`), and darkens the outer edge so no light
fringe shows on dark grounds (`clean_edges`). The gun is a separate drawing placed by its grip
(`"image"` parts; the near paw's gun is its mirror). The ears sit in front of the head over a
round skull fill, so they swing without opening a gap at the base. The thighs are cut along the
knee pads' own outlines with the hip behind them filled dark, and the feet have rounded,
outlined tops, so a step shows no cut edge. The head and ears come from `face_a.png`, the
corgi's face redrawn closer to the character sheet (big glossy eyes, a smaller smile); the spec's
`"sources"` scales and places that drawing onto `apose2.png`, and the torso fills the old head's
area dark so the new chin sits on the collar (`face_c.png`, `face_d.png` are other takes). The
expressions are `face_fire.png`, `face_hurt.png` and `face_blink.png`, `face_a.png` redrawn (by
image edit) with another eye and mouth; the head's `"faces"` cuts each into a variant
(`head_fire`, ...) of the same shape, taking only the `face_zone` box from it so the outline and
the fur round the face stay identical and a swap never jumps. The elbows are cut along the bracer's
edge: `fore_f` and `fore_n` are the forearms and paws, and the upper arms keep a round elbow cap
under them so a bend opens no gap. The
atlas packs at 0.7 so the close-up renders at full device resolution; G in the prototype zooms
out to the in-game size (120 units, about 70 CSS px on desktop), which is the size to judge the
face at. Springs are `TaoActor.spring` (`src/game/tao/spring.ts`).

**In the game**: `src/game/corgiHero.ts` (the motion in `corgiMotion.ts`, tested) plays the corgi
when the build's theme is corgi and the hero rig has the twin guns (`heroes.ts` picks it; the
monks keep `hero.ts`). The game's atlas packs at 0.35: `python tools/pack_tao.py
art/reskin/corgi/corgi_tao.json - art/reskin/corgi/game/art/hero 0.35`, then `python tools/webp.py
art/reskin/corgi/game/art/hero/atlas.png`; `corgi.json` maps `art/hero/*` to those files once the
theme takes it. The sim gives no aim point, so the view re-picks what the relic would hit
(`kickTarget`) four times a second and eases the aim there; every relic's attack is a shot of the
raised gun at the relic's strike (the staff shoots on its sweep and the guns follow the staff
while it is out; the beads' orbit is no shot, so the guns stay down), a hit plays `hurt`, and the
guns drop when the hero goes down. No death or level-up clips yet.

**Squad rigs**: Brick the bulldog (`art/reskin/bulldog/`, the fat monk's slot) and Ginger the cat
(`art/reskin/cat/`, the novice's) are made the same way, with the corgi's bone and slot names
and clips plus one spring candidate each (`plate`, the belly plate, and `scarf`, both under
`torso`). Each A-pose is fitted to the corgi's scale (`tools/fit_figure.py`: a 704 px figure,
feet at 505,732 on 1024x768) so the origin and the reused guns match. The bulldog's body is
`apose_b.png` and its head, ears and stub tail come from `apose_a.png` (`"sources"`,
`tail_stub.png`). Both have the corgi's elbows (`fore_f`, `fore_n`, cut at the bracer as on
the corgi) and its three faces (`face_fire.png`, `face_hurt.png`, `face_blink.png` in each
folder). The faces are drawn on the canvas of the head's own drawing (`apose_a.png` for the bulldog,
`apose3.png` for the cat): the image edit redraws a close-up of the head more faithfully than the
whole figure, so each take was pasted back and aligned to the drawing (a similarity fit on the
head outside the face zone) before `"faces"` cut it. Their prompts are the `face_*.txt` next to
them (the bulldog's take a crop of the head). Both pack at 0.35 straight into the corgi theme:
`python tools/pack_tao.py art/reskin/bulldog/bulldog_tao.json art/reskin/bulldog/bulldog.tao
art/reskin/corgi/game/art/monks/fat` (the cat into `.../novice`). The portraits
(`portrait.png` in each folder) are the rigs with both arms down, drawn by
`python tools/pose_parts.py <parts> <rig.json> <out.png> arm_f=-74 arm_n=74`, then packed
like the monks' sheet (`pack_icons.py --cell 256 --name monks` with `PAD = 2`, frames
corgi, bulldog, cat) into `art/reskin/corgi/game/art/icons/monks.png`.

### Bugs (baked)

Bake from small rigs instead of warping one drawing: six real legs walking in a tripod gait
reads as a bug in a way a wobble never does. Each type gets:

- walk (12 frames), wind-up / attack (6–8), and death: flipped on its back, legs kicking, then a
  teal goo pop (10);
- spawn: crawl out of a ground crack or drop in with a splat;
- runtime extras kept cheap for hundreds on screen: a random gait phase and speed, squash on
  hit, a per-target hit-stop (the hit bug freezes for 2–3 frames while the world keeps going; a
  global freeze would fight the sim's interpolation), knockback.

Frame counts roughly triple, so the art budget against the 4 MB main-package gate and WeChat's
subpackages needs watching.

### Elites and bosses (rigged)

Every boss gets a rig with a readable telegraph → attack → recover, plus hurt and death:

- Titan Beetle: rears up (wind-up), slam with shell shake and dust.
- Bog Worm: a follow-the-leader segment chain, procedural, so it slithers, dives and arcs
  naturally.
- Hive Queen: wing flutter layer, egg sac pulse when she summons.
- Overmind: tentacles as procedural wave chains, the brain throbs before a psychic line.
- Mecha-Biscuit: the hero rig in cold armour (as the Inner Demon is now), with a jerky
  robotic timing on its clips.

### Tooling

Hand-writing keys in JSON caps how rich the clips can get. `D:\daydayup\tools\animator` is a
timeline editor that authors .tao rigs and clips (Pixi 7, with easing presets); check its export
against `pack_tao.py`'s format, then use it for the corgi and the bosses, and key the bug rigs in it
too before baking.

## Builds

One codebase, two art sets, never mixed in a release (`build/theme.mjs`). Every existing build is
the `monk` theme and ships `client/public` as before. The `corgi` theme ships only the files
listed in `client/themes/corgi.json`: each path the game loads (the keys, which are exactly the
files of `client/public`, the reference for paths, formats and sheet layouts) maps to the corgi's
file in the repo, or `null` while it is not drawn. A corgi build fails, listing what is left, while
any entry is null or its file is missing, so `/new` goes live only with the art complete. A list
entry may point into `client/public` to reuse a monk file on purpose (a UI sound, say).

- `npm run check:theme` (part of `npm run check`) fails when the list and `client/public` drift
  apart, a source is missing, or a drawn PNG and its WebP twin differ in size; it counts the nulls.
  After adding or removing a file of `client/public`, `npm run check:theme -- --sync` adds it as
  null (or drops it).
- `npm run dev:new` (port 5184): the corgi on the dev server. Entries still null fall back to the
  monk file there, and only there.
- `npm run build:new` → `client/dist-new/new/`, served at https://h.gamestao.com/new/ by its own
  Worker (`wrangler/new.jsonc`, routes on the hostname ahead of Holy Kicker's custom domain). CI's
  `deploy-new` job ships it on a green push to main once the repository variable
  `NEW_WEB_DEPLOY_ENABLED` is `true`, with a Cloudflare token of its own, the secret
  `CLOUDFLARE_API_TOKEN_NEW` (`holy-kicker-new-ci`: Workers Scripts → Edit, and Zone → Workers
  Routes → Edit on gamestao.com only), so Holy Kicker's token keeps no zone rights.
- `npm run build:crazygames:new` → `client/dist-crazygames-new/`, the zip for its own CrazyGames
  game. WeChat, iOS and Playgama build the monk only.
- One backend, kept apart: corgi builds talk to https://hk.gamestao.com like Holy Kicker, and name
  themselves on everything they send (`game: 'corgi'`, the beacon's `&g=corgi`;
  `server/src/game.ts`). The server keeps that tag on the corgi's events, installs, daily actives,
  load beacons and problem reports, and Holy Kicker's documents carry none (as everything from
  before the corgi). The corgi's boards have ids of their own, `c3-corgi`, `c3h-corgi` and
  `w2026-43-e39-c1-corgi`, so no run of one game ranks on the other's. The dashboard and
  `/v1/stats` show one game at a time (`?game=corgi`; Holy Kicker's when not given), and
  `tools/launch_check.mjs` takes `--game corgi`. Install ids, and so tags and names, differ
  anyway: the corgi keeps its install id under `corgi:` like the rest of its save.
- Saves: in the browser the corgi keeps every key under `corgi:` (`src/theme.ts`), so the two games
  on h.gamestao.com never share a save.
- Words: `client/src/i18n/corgi/` overrides the strings that name the monk's world (heroes, relics
  → weapons, spells → gadgets, sutras → blueprints, shrines → supply drops, chapters → planets,
  copper → bolts, jade → gems, training → Boot Camp, the story lines), key for key over the base
  tables, in every language; `corgi.test.ts` keeps each table on the base table's keys and
  placeholders. The overlay is chosen through `__HK_THEME__`, so a monk build carries none of it.
  The XP pickups are treats there, which leaves "gems" for the premium currency.
- The page: `build/themeHtml.mjs` gives the corgi's `index.html` its title, colours and loading
  screen (a corgi head hopping where the cuju ball was); it fails the build if `index.html` loses
  the text it replaces.

Still to do before the corgi build can run as itself: the files still null in `corgi.json`
(`npm run check:theme` counts them).
