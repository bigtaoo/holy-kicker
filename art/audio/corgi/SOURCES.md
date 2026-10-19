# Corgi audio sources

The corgi theme's sound (docs/reskin.md): playful light sci-fi with dogs. Same pipeline as the
monk's (art/audio/SOURCES.md), with `--theme corgi`:

    python tools/audio_audition.py --theme corgi [--source DIR]   # writes art/audio/corgi/audition.html
    python tools/audio_build.py --theme corgi [--source DIR]      # art/audio/corgi/picks.json -> art/reskin/corgi/game/audio/

The cue table and candidate globs are in `tools/audio_corgi.py`. The raw downloads live in
`art/audio/source/corgi/` (not in the repo; re-download from the links below) next to the monk's,
and the corgi set also draws on the Kenney packs listed in art/audio/SOURCES.md. From a worktree,
pass `--source` the main checkout's `art/audio/source`.

Everything picked is CC0 (no attribution needed). Where a page offers several licenses, CC0 is
one of them and is the one we use.

| Folder | Source | Author | License |
|---|---|---|---|
| `kenney/kenney_sci-fi-sounds`, `kenney_digital-audio`, `kenney_interface-sounds`, `kenney_impact-sounds`, `kenney_music-jingles` | https://kenney.nl/assets | Kenney | CC0 |
| `oga/lib/swish-bamboo-stick-weapon-swhoshes`, `oga/lib/5-break-crunch-impacts` | see art/audio/SOURCES.md | qubodup | CC0 |
| `oga/lib/6-short-water-splashes` | https://opengameart.org/content/6-short-water-splashes | ezwa | CC0 |
| `oga/lib/teleport-spell` | https://opengameart.org/content/teleport-spell | ogrebane | CC0 |
| `corgi/dog-sounds` | https://opengameart.org/content/dog-sounds | pauliuw | CC0 |
| `corgi/dog-barking-mono` | https://opengameart.org/content/dog-barking-mono | HaelDB | OGA-BY 3.0 / CC0 |
| `corgi/dog-grunt` | https://opengameart.org/content/dog-grunt | qubodup | CC0 |
| `corgi/baby-animals` | https://opengameart.org/content/baby-animals-sounds-pack | Technopeasant | CC0 |
| `corgi/squish` | https://opengameart.org/content/squish-sounds-effects | EZduzziteh | CC0 |
| `corgi/pops-ez` | https://opengameart.org/content/pop-sounds-0 | EZduzziteh | CC0 |
| `corgi/alarm-ez` | https://opengameart.org/content/alarm-1 | EZduzziteh | CC0 |
| `corgi/fly-swatter` | https://opengameart.org/content/fly-swatter-squish-sound | qubodup | CC0 |
| `corgi/wet-squish` | https://opengameart.org/node/2547 | Independent.nu | CC0 |
| `corgi/insect-scream` | https://opengameart.org/content/insect-or-alien-scream-short | qubodup | CC0 |
| `corgi/enemy-sounds` | https://opengameart.org/content/enemy-sounds | AbNormalHumanBeing | CC0 |
| `corgi/bat-screeches` | https://opengameart.org/node/132771 | AntumDeluge | CC0 |
| `corgi/pops-cogito` | https://opengameart.org/content/pop-sounds | cogitollc | CC0 |
| `corgi/bubble-pop` | https://opengameart.org/content/bubbles-pop | farfadet46 | CC0 |
| `corgi/alarm-short` | https://opengameart.org/content/short-alarm | yd | CC0 |
| `corgi/sirens` | https://opengameart.org/content/sirens-and-alarm-noise | aquinn | CC0 |
| `corgi/music/interstellar-fleet` | https://opengameart.org/node/151669 | Zane Little Music | CC0 |
| `corgi/music/chiptune-adventures` | https://opengameart.org/content/4-chiptunes-adventure | Juhani Junkala (SubspaceAudio) | CC0 |
| `corgi/music/title-screen` | https://opengameart.org/content/chiptune-title-screen | tomcat | CC0 |
| `corgi/music/happy-adventure` | https://opengameart.org/content/happy-adventure-loop | TinyWorlds | CC0 |
| `corgi/music/space-shooter` | https://opengameart.org/node/146468 | HydroGene | CC0 |
| `corgi/music/arplands` | https://opengameart.org/node/192583 | LordZintick | CC0 |
| `corgi/music/elevator` | https://opengameart.org/node/86540 | You're Perfect Studio | CC0 (among others) |
| `corgi/music/push-ahead` | https://opengameart.org/node/123082 | Centurion_of_war | CC-BY 4.0 / CC0 |
| `corgi/music/battle-loop` | https://opengameart.org/content/8-bit-battle-loop | Wolfgang_ | CC0 |
| `corgi/music/perces` | https://opengameart.org/content/perces | poinl | CC0 |

Long recordings are offered as clips (`path@start#seconds` in the picks): the barks in
`dog-sounds/Dog/Dog 1.wav`, `Dog 2.wav` and `dog_barking_mono.wav`, the bug noises in
`enemy_sounds.ogg` and the sirens in `siren.mp3`.
