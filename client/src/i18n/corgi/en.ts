import type { en } from '../en';
import type { Override } from '../overlay';

// Corgi Commando's words in English, the source of the corgi tables (docs/reskin.md has the
// mapping): only the strings that name the monk's world, each at the base table's key. Every
// corgi table has exactly these keys (corgi.test.ts); the rest of the game reads the base table.
// Tone: cute, light sci-fi, no gore. The XP pickups are treats (the Treat Magnet passive), so
// "gems" is free for the premium currency.
export const corgiEn = {
  lobby: {
    guest: 'Cadet',
    chapterTitle: 'Planet {n}: {name}',
    unlockAtChapter: 'Clear planet {n} to unlock',
    relic: 'Weapon',
  },
  monk: {
    title: 'Squad',
    play: 'Deploy',
    kicker: { name: 'Biscuit' },
    fat: { name: 'Brick', role: 'Belly Bounce: every blow he takes bounces nearby bugs away' },
    novice: { name: 'Ginger', role: 'Light Feet: on the move, 1 in {n} blows misses her' },
  },
  tab: {
    train: 'Camp',
    unlockChapter: 'Unlocks after planet {n}',
  },
  chapter: {
    1: 'Frost Moon',
    2: 'Spore Jungle',
    3: 'Dune World',
    4: 'Magma Forge',
    5: 'Hive Core',
  },
  run: {
    reviveFree: 'Revive (Boot Camp)',
    fall: {
      crowd: { cause: 'Overrun by the swarm', tip: 'Circle around the swarm, don’t walk into it' },
      touch: { cause: 'Squashed by a big bug', tip: 'Keep away from elites and bosses: let your weapon hit them' },
      emerge: { cause: 'Grabbed from below', tip: 'Cracked ground means a bug is digging up: step off the cracks' },
      level: { cause: 'Too weak for wave {wave}', tip: 'Grab every treat: levels win the later waves' },
    },
    goal: {
      shrine: 'Only {n} more to the supply drop on wave {wave}',
      clear: 'Only {n} more to clear the planet',
    },
  },
  board: {
    title: 'Planet {n}: {name}',
    nouns: 'Corgi|Comet|Rocket|Puppy|Nova|Biscuit|Meteor|Pixel|Kitten|Orbit|Pebble|Rover|Star|Moon|Laser|Bagel',
  },
  challenge: {
    rule2: 'Your own gear and weapon, no revives',
  },
  mutator: {
    swift: 'Swift swarm', swiftInfo: 'the swarm moves faster', glass: 'Glass corgi',
  },
  weekly: {
    rule1: 'Everyone plays the same hero, weapon and blueprints', rule2: 'No gear, no Boot Camp, no revives',
  },
  tutorial: {
    auto: 'Your weapon fires on its own',
    gems: 'Grab the treats to level up',
  },
  card: {
    beads: 'Drones {a} → {b}',
    shrine: 'Supply Drop',
    awaken: 'Overdrive!',
    step: {
      cooldown: 'Gadget cooldown {a} → {b}',
      area: 'Gadget area {a} → {b}',
      duration: 'Gadget duration {a} → {b}',
    },
  },
  evolve: {
    ball: { name: 'Star Breaker', desc: 'Splits into {n} shots at every bounce' },
    staff: { name: 'Twin Saber' },
    fish: { name: 'Shock Core', desc: 'Every {n}th pulse stuns for {s}s' },
    beads: { name: 'Drone Swarm', desc: 'A second drone ring spins the other way' },
    bowl: { name: 'Saw Storm', desc: 'Zaps {n} bugs a throw, XP at once' },
    palm: { name: 'Orbital Barrage', desc: 'The crater stays and pins bugs {s}s' },
    bolt: { name: 'Tesla Storm' },
    incense: { name: 'Repair Pool' },
    bell: { name: 'Force Field' },
    cymbal: { name: 'Saw Ring', desc: '{n} saw blades circle you forever' },
    lotus: { name: 'Magnet Mines', desc: 'A mine at every step, blasts pull treats' },
    halo: { name: 'Laser Grid', desc: '{n} lasers turn around you' },
    roar: { name: 'Sonic Bark', desc: 'Barks all round, shatters bullets' },
  },
  shrine: {
    heal: { name: 'Med Kit' },
    insight: { name: 'Intel' },
    offering: { name: 'Bounty', desc: 'Live to the next drop or the end:', more: 'Bolts this run +{n}%' },
  },
  relic: {
    ball: { name: 'Ricochet Blaster', desc: 'Fires a shot that bounces between bugs' },
    staff: { name: 'Plasma Saber', desc: 'Sweeps nearby bugs, knocks them back' },
    fish: { name: 'Pulse Emitter', desc: 'Each pulse sends a ring through everything near' },
    beads: { name: 'Orbit Drones', desc: 'Drones circle you and hit all they touch' },
    bowl: { name: 'Disc Launcher', desc: 'Thrown and caught again, drags bugs away' },
  },
  spell: {
    palm: { name: 'Orbital Strike', desc: 'A strike from orbit hits the biggest crowd', count: 'Strikes {a} → {b}' },
    bolt: { name: 'Tesla Coil', desc: 'Lightning jumps through {n} bugs' },
    incense: { name: 'Plasma Puddle', desc: 'A plasma puddle fizzes at your feet for {s}s' },
    bell: { name: 'Bubble Shield', desc: 'Blocks a hit every {s}s, then pops' },
    cymbal: { name: 'Saw Blade', desc: '{n} saw blades fly out and pierce', count: 'Blades {a} → {b}' },
    lotus: { name: 'Proximity Mines', desc: 'Walking drops mines that blow up under bugs' },
    halo: { name: 'Laser Turret', desc: 'A laser turns around you, longer standing still', count: 'Lasers {a} → {b}' },
    roar: { name: 'Mega Bark', desc: 'A bark at the nearest bug pushes the swarm back' },
  },
  passive: {
    calm: { name: 'Coolant', desc: 'Gadget cooldown −{n}%' },
    iron: { name: 'Plating' },
    legs: { name: 'Jet Boots' },
    eye: { name: 'Wide Lens', desc: 'Gadget area +{n}%' },
    rice: { name: 'Kibble' },
    wrath: { name: 'Scope' },
    karma: { name: 'Treat Magnet' },
    focus: { name: 'Battery', desc: 'Gadget duration +{n}%, guard after a hit +{m}%' },
  },
  boss: {
    abbot: 'Titan Beetle',
    empowered: 'Titan Beetle, Empowered',
    carp: 'Bog Worm',
    carpEmpowered: 'Bog Worm, Empowered',
    witch: 'Hive Queen',
    witchEmpowered: 'Hive Queen, Empowered',
    judge: 'Overmind',
    judgeEmpowered: 'Overmind, Empowered',
    demon: 'Mecha-Biscuit',
    twins: 'Twin Ram Beetles',
  },
  story: {
    monk: 'Commando',
    c1: {
      midBefore: 'Two of them? Then two blasts.',
      midAfter: 'Now, where is the big one?',
      bossBefore: 'This moon is our nest now. Turn back, puppy.',
      bossAfter: 'Its shell hummed with a strange signal... It came from the jungle.',
    },
    c2: {
      midBefore: 'The signal patched up my shell!',
      midAfter: 'Stay down this time, big guy.',
      bossBefore: 'Nobody leaves my jungle without a mud bath.',
      bossAfter: 'Muddy paws again. The signal points to the dunes.',
    },
    c3: {
      midBefore: 'I tunnelled through a whole planet for this!',
      midAfter: 'Worms do not belong in the desert.',
      bossBefore: 'Such a fluffy little soldier... My grubs will adore you.',
      bossAfter: 'She was only taking orders. Who is sending the signal?',
    },
    c4: {
      midBefore: 'A queen always has more eggs.',
      midAfter: 'And I always have more shots.',
      bossBefore: 'I have read your mind, little dog. It is full of snacks.',
      bossAfter: 'Its star map says the signal starts in the Hive Core. Thanks!',
    },
    c5: {
      midBefore: 'A mind like mine can never be switched off!',
      midAfter: 'Switched off.',
      bossBefore: 'You flew all this way to find me. I am you, upgraded.',
      bossAfter: 'Just a copy with a bad attitude. Time to fly home for treats.',
    },
  },
  codex: {
    sutra: 'Blueprint: {goal}',
  },
  sutra: {
    wave: 'Reach wave {n} on a planet',
    clear: 'Clear planet {n}',
  },
  results: {
    cleared: 'Planet cleared!',
    hardCleared: 'Hard planet cleared!',
    copper: 'Bolts +{n}',
    nextChapter: 'Next planet',
    grit: 'Grit ×{n}: your next try on this planet is stronger',
    newRelic: 'New weapon: {name}!',
    newSutra: 'New blueprint: {name}!',
    double: 'Double bolts',
    doubled: 'Bolts doubled!',
  },
  shop: {
    jade: 'Gem chest',
    freeInfo: '{copper} bolts and {n} gear',
    adInfo: '{jade} gems and {n} gear',
    jadeInfo: '{n} gear from planet {chapter}',
    price: '{jade} gems',
    noJade: 'Not enough gems',
  },
  // English keeps the patrol as it was; the base Chinese sends the monk round the mountain
  patrol: {
    title: 'Patrol',
    stored: 'On patrol: {time} of {cap}h',
    tooSoon: 'Patrol a little longer first',
    quick: 'Quick patrol',
    quickAd: 'Quick ({n} left)',
    pays: 'So far: {copper} bolts, {n} gear',
    quickInfo: '{copper} bolts and {n} gear at once',
    quickJade: '{jade} gems ({n} left)',
  },
  tasks: {
    patrol: 'Collect from patrol',
    kills: 'Pop {n} bugs',
    reward: 'Each: {copper} bolts, {jade} gems',
    bonus: 'All claimed: +{jade} gems',
  },
  achieve: {
    kills: 'Pop {n} bugs in all',
    clear: 'Clear planet {n}',
    hard: 'Clear hard planet {n}',
    trained: 'Drill {n} times at Boot Camp',
    monks: 'Recruit all {n} heroes',
    reward: '+{jade} gems',
    claimAll: 'Claim all: +{jade} gems',
  },
  haul: {
    copper: 'Bolts +{n}',
    jade: 'Gems +{n}',
  },
  gear: {
    noCopper: 'Not enough bolts',
    item: {
      pendant: 'Dog Tag',
      bracers: 'Gauntlets',
      robe: 'Armour',
      sash: 'Utility Belt',
      sandals: 'Boots',
    },
  },
  tier: {
    0: 'Common',
    1: 'Uncommon',
    2: 'Rare',
    3: 'Epic',
    4: 'Legendary',
  },
  stat: {
    cooldown: 'Gadget cooldown −{n}%',
    area: 'Gadget area +{n}%',
    duration: 'Gadget duration +{n}%',
    copper: 'Bolts from runs +{n}%',
  },
  train: {
    progress: 'Boot Camp {n}/{total}',
    buy: 'Drill',
    done: 'Boot Camp complete',
    total: 'Stats from Boot Camp',
  },
  currency: {
    copper: 'Bolts',
    jade: 'Gems',
  },
  share: {
    title: 'One corgi, one blaster, a planet full of bugs. How many waves can you last?',
  },
} satisfies Override<typeof en>;
