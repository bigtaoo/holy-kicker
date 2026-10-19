"""The corgi theme's sound slots (docs/reskin.md): the same cues and music tracks as the monk's,
with what each one is in Corgi Commando and its candidate globs. tools/audio_audition.py and
tools/audio_build.py read this table with --theme corgi; sources and licenses are in
art/audio/corgi/SOURCES.md.

A candidate may name a clip of a longer file as "path@start#seconds" (both in seconds); the
audition page plays just that clip and audio_build.py cuts it the same way.
"""

K = 'kenney/kenney_'
SF = K + 'sci-fi-sounds/**/'
DA = K + 'digital-audio/**/'
UI = K + 'interface-sounds/**/'
IM = K + 'impact-sounds/**/'
NES = K + 'music-jingles/**/jingles_NES'
L = 'oga/lib/'
C = 'corgi/'
CM = 'corgi/music/'

DOG1 = C + 'dog-sounds/Dog/Dog 1.wav'
DOG2 = C + 'dog-sounds/Dog/Dog 2.wav'
BARKS = C + 'dog-barking-mono/dog_barking_mono.wav'
BUGS = C + 'enemy-sounds/enemy_sounds.ogg'
SIREN = C + 'sirens/siren.mp3'


def clips(path: str, spans: list[tuple[float, float]]) -> list[str]:
    return [f'{path}@{a:g}#{b - a:.2f}' for a, b in spans]


# the barks and yelps of the two noisy dog recordings and the four barks of the mono one
YELPS = clips(DOG1, [(0.25, 0.46), (1.4, 1.62), (2.78, 3.08), (6.15, 6.58)]) + clips(DOG2, [(0.38, 0.66), (1.97, 2.34), (3.93, 4.13), (4.21, 4.47), (8.2, 8.48)])
BARK4 = clips(BARKS, [(0.0, 0.3), (0.48, 0.78), (1.08, 1.42), (1.65, 2.04)])
# the twelve noises of the "Bug" enemy set
BUG12 = clips(BUGS, [(0.0, 1.12), (1.34, 2.42), (2.92, 3.51), (4.2, 4.72), (5.18, 5.97), (6.42, 7.17), (7.58, 8.71),
                     (9.12, 10.59), (11.33, 11.9), (12.5, 13.72), (14.28, 15.16)])
SIRENS = clips(SIREN, [(0.15, 2.4), (3.52, 5.6), (8.6, 10.8), (13.01, 15.2)])

# cue -> (what it is in the corgi theme, candidate globs relative to art/audio/source)
CUES = {
    'kick': ('Ricochet Blaster fires (frequent)', [SF + 'laserSmall_00*', SF + 'laserRetro_00*', DA + 'laser[1-9]*']),
    'thump': ('Blaster bolt hits a bug, Belly Bounce', [C + 'squish/squishsplat*', C + 'pops-ez/pop[1-4]*', IM + 'impactSoft_heavy_00[0-2]*', DA + 'spaceTrash[1-3]*']),
    'swish': ('Plasma Saber sweep, Light Feet dodge', [DA + 'phaserDown*', DA + 'phaseJump*', L + 'swish-bamboo-stick-weapon-swhoshes/**/swosh-0[1-8]*']),
    'woodfish': ('Pulse Emitter ring', [DA + 'phaseJump*', DA + 'lowDown*', DA + 'tone1*', SF + 'forceField_00*']),
    'hurt': ('Hero takes damage: a yelp', [C + 'baby-animals/Bark*', C + 'dog-sounds/Dog/Dog Bark [1-3]*', C + 'dog-grunt/*.flac'] + YELPS),
    'heroDown': ('Hero falls', [C + 'dog-sounds/Dog/Sad Dog*', NES + '0[0-9]*', DA + 'zapThreeToneDown*', DA + 'phaserDown*']),
    'revive': ('Hero revives', [DA + 'powerUp*', DA + 'phaserUp*', NES + '1[0-6]*']),
    'hit': ('Spell hits a bug (very frequent)', [C + 'pops-cogito/pop[2-9]*', C + 'pops-ez/pop[6-9]*', DA + 'spaceTrash*', IM + 'impactGeneric_light_00[0-4]*']),
    'crit': ('Critical hit', [DA + 'zap[12]*', SF + 'impactMetal_00*', IM + 'impactPlate_heavy_00[0-2]*', C + 'squish/squishpop*']),
    'pop': ('A bug dies in a goo splat (very frequent)', [C + 'squish/squish*', C + 'fly-swatter/**/*.wav', C + 'pops-ez/pop[1-5]*']),
    'eliteDown': ('Elite bug dies', [C + 'wet-squish/**/*.flac', C + 'squish/squishsplat*', SF + 'explosionCrunch_00*']),
    'clang': ('Shield Beetle / Fortress Crab blocks', [SF + 'impactMetal_00*', IM + 'impactMetal_heavy_00[0-2]*', SF + 'forceField_00*']),
    'nova': ('Bubble Shield bursts into a nova', [SF + 'lowFrequency_explosion*', SF + 'forceField_00*', DA + 'phaserDown*', SF + 'explosionCrunch_00*']),
    'meteor': ('Orbital Strike lands', [SF + 'laserLarge_00*', SF + 'lowFrequency_explosion*', SF + 'explosionCrunch_00*']),
    'field': ('Plasma Puddle', [SF + 'forceField_00*', SF + 'slime_00*', SF + 'computerNoise_00*']),
    'zap': ('Tesla Coil chain (many a second)', [DA + 'zap*', DA + 'laser[5-9]*']),
    'bloom': ('Proximity Mine goes off', [SF + 'explosionCrunch_00*', DA + 'pepSound*', DA + 'spaceTrash*']),
    'roar': ('Mega Bark', [C + 'dog-sounds/Dog/Dog Bark*', C + 'baby-animals/Bark*'] + BARK4 + YELPS),
    'bell': ('Bubble Shield up', [SF + 'forceField_00*', DA + 'phaserUp*', DA + 'powerUp*']),
    'bellBreak': ('Bubble Shield pops', [C + 'bubble-pop/pop.ogg', C + 'pops-cogito/pop[01]*', C + 'pops-ez/pop5*', IM + 'impactGlass_heavy_00[0-2]*']),
    'splash': ('Burrow / Bog Worm digs in or surfaces', [SF + 'slime_00*', C + 'wet-squish/**/*0[1-4]*', L + '6-short-water-splashes/**/*']),
    'howl': ('Alpha Mantis screech', [C + 'insect-scream/*', C + 'bat-screeches/*'] + BUG12),
    'summon': ('Hive Queen calls grubs', BUG12 + [C + 'bat-screeches/*', C + 'insect-scream/*']),
    'bossCast': ('Boss casts (Overmind, Mecha-Biscuit)', [DA + 'phaserUp*', SF + 'computerNoise_00*', SF + 'forceField_00*', L + 'teleport-spell/*']),
    'windup': ('Titan Beetle winds up a slam', [DA + 'phaserUp*', DA + 'powerUp*', SF + 'thrusterFire_00*', BUGS + '@0#1.12']),
    'slam': ('Boss slams the ground', [SF + 'lowFrequency_explosion*', SF + 'explosionCrunch_00*', L + '5-break-crunch-impacts/**/*0[1-3]*']),
    'bossDown': ('Boss dies', [C + 'wet-squish/**/*0[25]*', C + 'insect-scream/*', SF + 'lowFrequency_explosion*'] + BUG12),
    'blast': ('Acid / psychic zone bursts', [SF + 'slime_00*', C + 'squish/squishsplat*', SF + 'explosionCrunch_00*', C + 'wet-squish/**/*0[6-8]*']),
    'gem': ('Gem picked up (frequent)', [UI + 'select_00[1-5]*', DA + 'pepSound*', DA + 'highUp*']),
    'levelUp': ('Level up', [NES + '*', DA + 'powerUp*', DA + 'threeTone*', C + 'baby-animals/Bark*']),
    'pick': ('Card picked', [UI + 'confirmation_00*', UI + 'maximize_00[1-4]*', DA + 'twoTone*']),
    'wave': ('Boss / elite wave starts: alarm', [C + 'alarm-ez/alarm_2*', C + 'alarm-short/alarm.ogg', DA + 'lowThreeTone*'] + SIRENS),
    'cleared': ('Chapter cleared', [NES + '*', K + 'music-jingles/**/jingles_HIT1[0-6]*']),
    'tap': ('UI button tap', [UI + 'click_00*', UI + 'select_00[6-8]*', UI + 'switch_00[1-3]*']),
}

MUSIC = {
    'music.lobby': ('Lobby music (cheerful, loops)', [CM + 'title-screen/*', CM + 'happy-adventure/*', CM + 'chiptune-adventures/*4.*', CM + 'elevator/*', CM + 'push-ahead/*', CM + 'perces/*']),
    'music.battle': ('Battle music (driving, loops)', [CM + 'interstellar-fleet/*', CM + 'chiptune-adventures/*[12].*', CM + 'space-shooter/*', CM + 'arplands/*', CM + 'push-ahead/*']),
    'music.boss': ('Boss music (mid-boss and boss waves, loops)', [CM + 'chiptune-adventures/*3.*', CM + 'battle-loop/*', CM + 'space-shooter/*', CM + 'interstellar-fleet/*']),
}

# art/audio/source folder -> credit line (art/audio/corgi/SOURCES.md has the links and licenses)
AUTHORS = [
    ('kenney/', 'Kenney (CC0)'),
    ('corgi/dog-sounds/', 'pauliuw (CC0)'),
    ('corgi/dog-barking-mono/', 'HaelDB (CC0)'),
    ('corgi/dog-grunt/', 'qubodup (CC0)'),
    ('corgi/baby-animals/', 'Technopeasant (CC0)'),
    ('corgi/squish/', 'EZduzziteh (CC0)'),
    ('corgi/pops-ez/', 'EZduzziteh (CC0)'),
    ('corgi/alarm-ez/', 'EZduzziteh (CC0)'),
    ('corgi/fly-swatter/', 'qubodup (CC0)'),
    ('corgi/wet-squish/', 'Independent.nu (CC0)'),
    ('corgi/insect-scream/', 'qubodup (CC0)'),
    ('corgi/enemy-sounds/', 'AbNormalHumanBeing (CC0)'),
    ('corgi/bat-screeches/', 'AntumDeluge (CC0)'),
    ('corgi/pops-cogito/', 'cogitollc (CC0)'),
    ('corgi/bubble-pop/', 'farfadet46 (CC0)'),
    ('corgi/alarm-short/', 'yd (CC0)'),
    ('corgi/sirens/', 'aquinn (CC0)'),
    ('corgi/music/interstellar-fleet/', 'Zane Little Music (CC0)'),
    ('corgi/music/perces/', 'poinl (CC0)'),
    ('corgi/music/chiptune-adventures/', 'Juhani Junkala (CC0)'),
    ('corgi/music/arplands/', 'LordZintick (CC0)'),
    ('corgi/music/space-shooter/', 'HydroGene (CC0)'),
    ('corgi/music/happy-adventure/', 'TinyWorlds (CC0)'),
    ('corgi/music/title-screen/', 'tomcat (CC0)'),
    ('corgi/music/elevator/', "You're Perfect Studio (CC0)"),
    ('corgi/music/push-ahead/', 'Centurion_of_war (CC0)'),
    ('corgi/music/battle-loop/', 'Wolfgang_ (CC0)'),
    ('oga/lib/6-short-water-splashes', 'ezwa (CC0)'),
    ('oga/lib/teleport-spell', 'ogrebane (CC0)'),
    ('oga/lib/', 'qubodup (CC0)'),
]
