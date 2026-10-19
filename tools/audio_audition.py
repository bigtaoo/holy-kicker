"""Writes art/audio/audition.html: for each sound cue (client/src/audio/cues.ts) and the
music slots (lobby, battle, boss), the downloaded candidates (art/audio/source) to listen to and pick from.

The page keeps the picks in the browser and shows them as JSON to paste back. Run it again
after adding sources; the candidate globs are below.

    python tools/audio_audition.py [--theme corgi] [--source DIR]

--theme corgi writes art/audio/corgi/audition.html from the corgi table (tools/audio_corgi.py),
preselecting art/audio/corgi/picks.json. --source reads the downloads from another folder (a
worktree has none: point it at the main checkout's art/audio/source); picks still name them
"source/...". Each candidate shows its length and roughly what it adds to the shipped audio.
"""
import argparse
import glob
import html
import json
import os
import subprocess
import urllib.parse

import audio_corgi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'audio')
SRC = os.path.join(ROOT, 'source')
# what audio_build.py ships: effects capped at 3 s, everything at 96 kbps
MAX_SFX = 3.0
KB_PER_S = 12

K = 'kenney/kenney_'
L = 'oga/lib/'
M = 'oga/magic8/'

# cue -> (what it is, candidate globs relative to art/audio/source)
CUES = {
    'kick': ('Hero kicks the ball', [K + 'impact-sounds/**/impactSoft_medium_00[0-2]*', K + 'impact-sounds/**/impactPunch_medium_00[0-2]*', L + '37-hitspunches/**/hit0[1-4]*']),
    'thump': ('Ball hits a mob', [K + 'impact-sounds/**/impactSoft_heavy_00[0-2]*', K + 'impact-sounds/**/impactPunch_heavy_00[0-1]*', L + '37-hitspunches/**/hit1[0-3]*']),
    'swish': ('Staff sweep', [L + 'swish-bamboo-stick-weapon-swhoshes/**/swosh-0[1-8]*', K + 'rpg-audio/**/knifeSlice*']),
    'woodfish': ('Wooden fish knock (sound ring)', [K + 'impact-sounds/**/impactWood_light_00[0-4]*', K + 'impact-sounds/**/impactPlank_medium_00[0-2]*']),
    'hurt': ('Hero takes damage', [K + 'impact-sounds/**/impactPunch_heavy_00[2-4]*', L + '37-hitspunches/**/hit2[0-4]*']),
    'heroDown': ('Hero falls', ['kenney/kenney_music-jingles/**/jingles_PIZZI0[0-5]*', 'kenney/kenney_music-jingles/**/jingles_STEEL0[0-5]*']),
    'revive': ('Hero revives', [M + '45_Charge*', L + 'teleport-spell/*', 'kenney/kenney_music-jingles/**/jingles_STEEL1[0-3]*']),
    'hit': ('Spell hits a mob (very frequent)', [K + 'impact-sounds/**/impactGeneric_light_00[0-4]*', L + '37-hitspunches/**/hit3[0-4]*']),
    'crit': ('Critical hit', [K + 'impact-sounds/**/impactPlate_heavy_00[0-2]*', K + 'impact-sounds/**/impactPunch_heavy_00[0-2]*']),
    'pop': ('A mob dies (very frequent)', [K + 'interface-sounds/**/drop_00*', K + 'interface-sounds/**/pluck_00*', K + 'impact-sounds/**/impactSoft_medium_00[3-4]*']),
    'eliteDown': ('Elite dies', [L + '5-break-crunch-impacts/**/*', K + 'impact-sounds/**/impactMining_00[0-2]*']),
    'clang': ('Door god shield blocks', [K + 'impact-sounds/**/impactMetal_heavy_00[0-2]*', K + 'impact-sounds/**/impactMetal_medium_00[0-2]*', L + 'metal-interactions/**/metal_interaction*']),
    'nova': ('Buddha palm', [M + '30_Earth*', L + 'earth-element-magic-spell/*.ogg', K + 'impact-sounds/**/impactSoft_heavy_00[3-4]*']),
    'meteor': ('Meteor ball', [M + '04_Fire*', L + '5-break-crunch-impacts/**/*0[1-2]*']),
    'field': ('Incense field', [M + '25_Wind*', M + '46_Poison*']),
    'zap': ('Vajra thunder', [M + '18_Thunder*', K + 'interface-sounds/**/glitch_00*']),
    'bloom': ('Lotus step blooms', [K + 'interface-sounds/**/glass_00[0-5]*', K + 'interface-sounds/**/pluck_00*']),
    'roar': ('Lion roar sutra', [L + 'monster-or-beast-sounds/**/Beast Growl*', L + 'monster-or-beast-sounds/**/Demon Growl*']),
    'bell': ('Golden bell shield up', [K + 'impact-sounds/**/impactBell_heavy_00*', 'oga/pleasing-bell.wav']),
    'bellBreak': ('Golden bell bursts', [K + 'impact-sounds/**/impactGlass_heavy_00[0-2]*', M + '13_Ice*', L + 'ice-spells/**/*']),
    'splash': ('Water ghost / carp surfaces', [L + '6-short-water-splashes/**/*', M + '22_Water*']),
    'howl': ('Wolf howl', [L + 'animal-or-beast-sounds/**/Voice*', L + 'monster-or-beast-sounds/**/Spirit Shout*']),
    'summon': ('Boss summons', [L + 'ghost-monster-voice-moaning-growling/**/*0[1-4]*', L + 'ghost/*', L + 'monster-or-beast-sounds/**/Children Spirit*']),
    'bossCast': ('Boss casts', [L + 'monster-or-beast-sounds/**/Demon Call*', M + '45_Charge*']),
    'windup': ('Boss winds up a slam', [L + 'metal-interactions/**/metal_swing*', L + 'swish-bamboo-stick-weapon-swhoshes/**/swosh-3[0-3]*', M + '45_Charge*']),
    'slam': ('Boss slams the ground', [K + 'impact-sounds/**/impactMining_00[2-4]*', K + 'impact-sounds/**/impactPlate_heavy_00[3-4]*', L + '5-break-crunch-impacts/**/*0[3-5]*']),
    'bossDown': ('Boss dies', [L + 'monster-or-beast-sounds/**/Dieing Beast*', L + 'monster-or-beast-sounds/**/Demon Growl*']),
    'blast': ('Poison zone bursts', [M + '46_Poison*', L + '5-break-crunch-impacts/**/*', K + 'impact-sounds/**/impactGlass_medium_00[0-2]*']),
    'gem': ('Gem picked up (frequent)', [K + 'interface-sounds/**/select_00[1-5]*', K + 'interface-sounds/**/tick_00*', K + 'rpg-audio/**/handleCoins*']),
    'levelUp': ('Level up', ['kenney/kenney_music-jingles/**/jingles_HIT0[0-8]*', 'kenney/kenney_music-jingles/**/jingles_STEEL0[6-9]*']),
    'pick': ('Card picked', [K + 'interface-sounds/**/confirmation_00*', K + 'interface-sounds/**/maximize_00[1-4]*']),
    'wave': ('Boss / elite wave starts', [K + 'impact-sounds/**/impactBell_heavy_00[2-4]*', 'kenney/kenney_music-jingles/**/jingles_HIT1[0-6]*']),
    'cleared': ('Chapter cleared', ['kenney/kenney_music-jingles/**/jingles_PIZZI1[0-6]*', 'kenney/kenney_music-jingles/**/jingles_STEEL1[4-6]*', 'kenney/kenney_music-jingles/**/jingles_NES1[0-6]*']),
    'tap': ('UI button tap', [K + 'interface-sounds/**/click_00*', K + 'interface-sounds/**/select_00[6-8]*', K + 'interface-sounds/**/switch_00[1-3]*']),
}

MUSIC = {
    'music.lobby': ('Lobby music (calm, loops)', ['oga/asianoriental1_0.ogg', 'oga/menu_1.mp3', 'itch/**/*.*']),
    'music.battle': ('Battle music (driving, loops)', ['oga/chipnese_2.ogg', 'oga/menu_1.mp3', 'itch/**/*.*']),
    'music.boss': ('Boss music (mid-boss and boss waves, loops)', ['oga/boss/**/*.ogg', 'oga/boss/**/*.wav', 'oga/boss/**/*.mp3']),
}

AUDIO = ('.wav', '.ogg', '.mp3', '.flac')


def seconds(path: str) -> float:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def expand(src: str, globs: list[str]) -> list[dict]:
    """Candidates as {v: the pick ("source/<rel>[@start][#seconds]"), d: its length in seconds}."""
    out: list[dict] = []
    for g in globs:
        g, at, clip = g.partition('@')
        for p in sorted(glob.glob(os.path.join(src, g), recursive=True)):
            rel = 'source/' + os.path.relpath(p, src).replace(os.sep, '/')
            v = rel + at + clip
            if p.lower().endswith(AUDIO) and 'Preview' not in rel and all(c['v'] != v for c in out):
                d = float(clip.partition('#')[2]) if clip else seconds(p)
                out.append({'v': v, 'd': round(d, 2)})
    return out


def base_url(page_dir: str, src: str) -> str:
    """How the page reaches the downloads: a relative path when it can, else a file: URL."""
    try:
        return urllib.parse.quote(os.path.relpath(src, page_dir).replace(os.sep, '/')) + '/'
    except ValueError:
        return 'file:///' + urllib.parse.quote(os.path.abspath(src).replace(os.sep, '/')) + '/'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--theme', choices=['monk', 'corgi'], default='monk')
    ap.add_argument('--source', default=SRC)
    a = ap.parse_args()
    corgi = a.theme == 'corgi'
    page_dir = os.path.join(ROOT, 'corgi') if corgi else ROOT
    slots = {**audio_corgi.CUES, **audio_corgi.MUSIC} if corgi else {**CUES, **MUSIC}
    sections = [{'key': k, 'what': what, 'files': expand(a.source, globs)} for k, (what, globs) in slots.items()]
    with open(os.path.join(page_dir, 'picks.json'), encoding='utf-8') as f:
        defaults = json.load(f)
    data = {'slots': sections, 'defaults': defaults, 'base': base_url(page_dir, a.source),
            'store': 'hk.audition' + ('.corgi' if corgi else ''), 'maxSfx': MAX_SFX, 'kbps': KB_PER_S}
    page = TEMPLATE.replace('__TITLE__', 'Corgi sound audition' if corgi else 'Sound audition')
    page = page.replace('__DATA__', html.escape(json.dumps(data), quote=False))
    with open(os.path.join(page_dir, 'audition.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    total = sum(len(s['files']) for s in sections)
    empty = [s['key'] for s in sections if not s['files']]
    missing = [k for k, v in defaults.items() if v != 'synth' and not any(v.split('#')[0] == c['v'].split('#')[0] for s in sections for c in s['files'])]
    print(f'{len(sections)} slots, {total} candidates; empty: {empty or "none"}; defaults not among them: {missing or "none"}')


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>__TITLE__</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#f7f5f0;--fg:#222;--card:#fff;--line:#ddd;--pick:#e8a317}
@media (prefers-color-scheme:dark){:root{--bg:#1b1b1b;--fg:#eee;--card:#262626;--line:#444}}
body{background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif;margin:0 auto;max-width:980px;padding:16px}
h1{font-size:20px}section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:10px 0}
section.done{border-color:var(--pick)}h2{font-size:15px;margin:0 0 6px}h2 small{font-weight:normal;opacity:.7}
.opts{display:flex;flex-wrap:wrap;gap:6px}button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--fg);border-radius:6px;padding:4px 8px;cursor:pointer}
button.on{background:var(--pick);color:#000;border-color:var(--pick)}button.playing{outline:2px solid var(--pick)}
button small{opacity:.6}
#out{width:100%;height:140px;font:12px monospace;background:var(--card);color:var(--fg);border:1px solid var(--line)}
.bar{position:sticky;top:0;background:var(--bg);padding:6px 0;z-index:1;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
</style></head><body>
<h1>__TITLE__</h1>
<p>▶ plays a candidate, ✓ picks it (click again to unpick). "Keep synth" keeps today's generated sound. Picks start from the
shipped picks.json and are kept in this browser; copy the JSON at the bottom back to Claude. Each candidate shows its length;
the bar shows roughly how big the picks ship (effects capped at 3 s, 96 kbps).</p>
<div class="bar"><span id="count"></span><span id="size"></span><button id="reset">Reset to picks.json</button></div>
<div id="list"></div>
<h2>Picks</h2><textarea id="out" readonly></textarea>
<script id="data" type="application/json">__DATA__</script>
<script>
const data = JSON.parse(document.getElementById('data').textContent);
const slots = data.slots;
let picks = Object.assign({}, data.defaults);
try { const kept = localStorage.getItem(data.store); if (kept) picks = JSON.parse(kept); } catch {}
const audio = new Audio();
let playingBtn = null, stopTimer = 0;
// "source/<rel>[@start][#seconds]" -> the file, where to start and how long to play
function parse(v) {
  const [head, cut] = v.split('#');
  const [path, at] = head.split('@');
  return { url: data.base + path.slice(7).split('/').map(encodeURIComponent).join('/'), start: +(at || 0), len: cut ? +cut : 0 };
}
function stop() { clearTimeout(stopTimer); audio.pause(); if (playingBtn) playingBtn.classList.remove('playing'); playingBtn = null; }
function play(v, btn) {
  stop();
  const c = parse(v);
  audio.src = c.url;
  audio.onloadedmetadata = () => {
    audio.currentTime = c.start;
    audio.play().catch(() => {});
    if (c.len) stopTimer = setTimeout(stop, c.len * 1000);
  };
  playingBtn = btn; btn.classList.add('playing');
}
audio.onended = stop;
const lengths = {};
for (const s of slots) for (const f of s.files) lengths[f.v] = f.d;
function shipped(key, v) {
  const d = lengths[v] ?? lengths[v.split('#')[0]] ?? 0;
  const cut = v.includes('#') ? +v.split('#').pop() : Infinity;
  return (key.startsWith('music') ? d : Math.min(d, cut, data.maxSfx)) * data.kbps;
}
function save() {
  try { localStorage.setItem(data.store, JSON.stringify(picks)); } catch {}
  document.getElementById('out').value = JSON.stringify(picks, null, 1);
  const n = Object.keys(picks).length;
  document.getElementById('count').textContent = n + ' / ' + slots.length + ' picked';
  let kb = 0;
  for (const [k, v] of Object.entries(picks)) if (v !== 'synth') kb += shipped(k, v);
  document.getElementById('size').textContent = '≈ ' + (kb / 1024).toFixed(2) + ' MB shipped';
}
const marks = [];
const list = document.getElementById('list');
for (const s of slots) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>' + s.key + ' <small>' + s.what + '</small></h2><div class="opts"></div>';
  const opts = sec.querySelector('.opts');
  const btns = [];
  // a pick may add a "#seconds" cut to a candidate: it still marks that candidate
  const same = (pick, v) => pick === v || (!!pick && !v.includes('#') && pick.startsWith(v + '#'));
  const mark = () => { for (const b of btns) b.classList.toggle('on', same(picks[s.key], b.dataset.v)); sec.classList.toggle('done', !!picks[s.key]); };
  const add = (label, value, d) => {
    const wrap = document.createElement('span');
    if (value !== 'synth') {
      const p = document.createElement('button');
      p.innerHTML = '▶ ' + label.replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' <small>' + d.toFixed(2) + 's</small>'; p.title = value;
      p.onclick = () => play(value, p);
      wrap.appendChild(p);
    }
    const b = document.createElement('button');
    b.textContent = value === 'synth' ? 'Keep synth' : '✓'; b.dataset.v = value;
    b.onclick = () => {
      if (same(picks[s.key], value)) delete picks[s.key];
      else picks[s.key] = same(data.defaults[s.key], value) ? data.defaults[s.key] : value;
      mark(); save();
    };
    wrap.appendChild(b);
    btns.push(b); opts.appendChild(wrap);
  };
  for (const f of s.files) {
    const [head] = f.v.split('#');
    const [path, at] = head.split('@');
    add(path.split('/').pop().replace(/\\.(wav|ogg|mp3|flac)$/i, '') + (at ? ' @' + at : ''), f.v, f.d);
  }
  if (!s.key.startsWith('music')) add('Synth', 'synth', 0);
  marks.push(mark); mark(); list.appendChild(sec);
}
document.getElementById('reset').onclick = () => { picks = Object.assign({}, data.defaults); for (const m of marks) m(); save(); };
save();
</script></body></html>
"""

if __name__ == '__main__':
    main()
