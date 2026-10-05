"""Builds the shipped sounds from the audition picks (art/audio/picks.json, the JSON that
art/audio/audition.html shows): every picked effect is trimmed of silence at both ends, capped
in length, peak-normalised to -1 dBFS and encoded as mono MP3; every picked music track as
stereo MP3. Writes client/public/audio/{sfx,music}/ and audio/sounds.json (audio/samples.ts),
and prints the authors to credit. Needs ffmpeg and ffprobe on the PATH.

    python tools/audio_build.py [picks.json]

A cue picked as "synth" (or not picked) keeps its generated voice. A pick may end in "#seconds" to
cut that effect shorter than MAX_SFX (e.g. a chain zap that fires many times a second). MP3 because it is the one
format every target decodes: browsers, iOS and WeChat's decodeAudioData and InnerAudioContext.
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', 'art', 'audio')
OUT = os.path.join(HERE, '..', 'client', 'public', 'audio')

# effects longer than this are cut (with a short fade); the cue gaps are far shorter anyway
MAX_SFX = 3.0
SFX_RATE = '44100'
SFX_KBPS = '96k'
MUSIC_KBPS = '96k'
PEAK_DB = -1.0
# silence below this at either end of an effect is trimmed
SILENCE = '-50dB'

# art/audio/source folder -> credit line (art/audio/SOURCES.md has the links and licenses)
AUTHORS = [
    ('kenney/', 'Kenney (CC0)'),
    ('oga/magic8/', 'leohpaz (CC-BY 4.0)'),
    ('itch/', 'BiteMe Games (CC0)'),
    ('oga/pleasing-bell', 'Spring Spring (CC0)'),
    ('oga/chipnese', 'Spring Spring (CC0)'),
    ('oga/asianoriental', 'Tozan (CC0)'),
    ('oga/menu_', 'wipics (CC0)'),
    ('oga/lib/6-short-water-splashes', 'ezwa (CC0)'),
    ('oga/lib/ice-spells', 'bart (CC0)'),
    ('oga/lib/ghost/', 'ogrebane (CC0)'),
    ('oga/lib/teleport-spell', 'ogrebane (CC0)'),
    ('oga/lib/monster-or-beast-sounds', 'pauliuw (CC0)'),
    ('oga/lib/animal-or-beast-sounds', 'pauliuw (CC0)'),
    ('oga/lib2/wolf_monster', 'CaveboyTup (CC0)'),
    ('oga/boss/determined_pursuit', 'Emma_MA (CC0)'),
    ('oga/boss/ninja', 'Spring Spring (CC0)'),
    ('oga/boss/Heavy Concept', 'cynicmusic (CC0)'),
    ('oga/boss/Swordfight', 'Kistol (CC0)'),
    ('oga/boss/CleytonRX', 'CleytonKauffman (CC0)'),
    ('oga/boss/heavy_boss', 'MintoDog (CC0)'),
    ('oga/boss/fight', 'Ville Nousiainen (CC0)'),
    ('oga/boss/Oriental', 'Shadowfire452 (CC0)'),
    ('oga/boss/jrpg5/', 'Juhani Junkala (CC0)'),
    ('oga/lib/', 'qubodup (CC0)'),
]


def run(args: list[str]) -> str:
    r = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise RuntimeError(f'{args[0]} failed: {r.stderr[-800:]}')
    return r.stderr


def peak_db(path: str, filters: str) -> float:
    err = run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'{filters},volumedetect', '-f', 'null', '-'])
    m = re.search(r'max_volume: (-?[\d.]+) dB', err)
    return float(m.group(1)) if m else 0.0


def duration(path: str) -> float:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def encode(src: str, dst: str, filters: str, channels: str, kbps: str) -> None:
    gain = PEAK_DB - peak_db(src, filters)
    run(['ffmpeg', '-hide_banner', '-y', '-i', src, '-af', f'{filters},volume={gain:.2f}dB',
         '-ac', channels, '-ar', SFX_RATE, '-c:a', 'libmp3lame', '-b:a', kbps, dst])


def sfx_filters(length: float = MAX_SFX) -> str:
    trim = f'silenceremove=start_periods=1:start_threshold={SILENCE}:start_silence=0.005'
    # trim the tail by trimming the reversed head; then cap the length with a fade out
    fade = min(0.15, length / 3)
    return (f'{trim},areverse,{trim},areverse,'
            f'atrim=0:{length},afade=t=out:st={length - fade:.3f}:d={fade:.3f}')


def credit(path: str) -> str:
    return next((who for prefix, who in AUTHORS if path.startswith(prefix)), 'unknown')


def main() -> None:
    picks_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ART, 'picks.json')
    with open(picks_path, encoding='utf-8') as f:
        picks: dict[str, str] = json.load(f)
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(os.path.join(OUT, 'sfx'))
    os.makedirs(os.path.join(OUT, 'music'))
    manifest: dict = {'sfx': {}, 'music': {}}
    used: dict[str, list[str]] = {}
    for slot, pick in sorted(picks.items()):
        if not pick or pick == 'synth':
            continue
        pick, _, cut = pick.partition('#')
        rel = pick.removeprefix('source/')
        src = os.path.join(ART, 'source', rel)
        if slot.startswith('music.'):
            track = slot.removeprefix('music.')
            dst = f'music/{track}.mp3'
            encode(src, os.path.join(OUT, dst), 'anull', '2', MUSIC_KBPS)
            manifest['music'][track] = {'path': f'audio/{dst}', 'length': round(duration(os.path.join(OUT, dst)), 3)}
        else:
            dst = f'sfx/{slot}.mp3'
            encode(src, os.path.join(OUT, dst), sfx_filters(min(float(cut or MAX_SFX), MAX_SFX)), '1', SFX_KBPS)
            manifest['sfx'][slot] = [f'audio/{dst}']
        used.setdefault(credit(rel), []).append(slot)
    with open(os.path.join(OUT, 'sounds.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    total = sum(os.path.getsize(os.path.join(dp, n)) for dp, _, ns in os.walk(OUT) for n in ns)
    print(f'{len(manifest["sfx"])} effects, {len(manifest["music"])} tracks, {total / 1024:.0f} KB')
    for who, slots in sorted(used.items()):
        print(f'  {who}: {", ".join(slots)}')


if __name__ == '__main__':
    main()
