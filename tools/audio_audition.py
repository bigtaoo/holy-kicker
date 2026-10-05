"""Writes art/audio/audition.html: for each sound cue (client/src/audio/cues.ts) and the
music slots (lobby, battle, boss), the downloaded candidates (art/audio/source) to listen to and pick from.

The page keeps the picks in the browser and shows them as JSON to paste back. Run it again
after adding sources; the candidate globs are below.

    python tools/audio_audition.py
"""
import glob
import html
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'art', 'audio')
SRC = os.path.join(ROOT, 'source')

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


def expand(globs: list[str]) -> list[str]:
    out: list[str] = []
    for g in globs:
        for p in sorted(glob.glob(os.path.join(SRC, g), recursive=True)):
            rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
            if p.lower().endswith(AUDIO) and 'Preview' not in rel and rel not in out:
                out.append(rel)
    return out


def main() -> None:
    sections = []
    for key, (what, globs) in {**CUES, **MUSIC}.items():
        sections.append({'key': key, 'what': what, 'files': expand(globs)})
    page = TEMPLATE.replace('__DATA__', html.escape(json.dumps(sections), quote=False))
    with open(os.path.join(ROOT, 'audition.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    total = sum(len(s['files']) for s in sections)
    empty = [s['key'] for s in sections if not s['files']]
    print(f'{len(sections)} slots, {total} candidates; empty: {empty or "none"}')


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sound audition</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#f7f5f0;--fg:#222;--card:#fff;--line:#ddd;--pick:#e8a317}
@media (prefers-color-scheme:dark){:root{--bg:#1b1b1b;--fg:#eee;--card:#262626;--line:#444}}
body{background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif;margin:0 auto;max-width:980px;padding:16px}
h1{font-size:20px}section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:10px 0}
section.done{border-color:var(--pick)}h2{font-size:15px;margin:0 0 6px}h2 small{font-weight:normal;opacity:.7}
.opts{display:flex;flex-wrap:wrap;gap:6px}button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--fg);border-radius:6px;padding:4px 8px;cursor:pointer}
button.on{background:var(--pick);color:#000;border-color:var(--pick)}button.playing{outline:2px solid var(--pick)}
#out{width:100%;height:140px;font:12px monospace;background:var(--card);color:var(--fg);border:1px solid var(--line)}
.bar{position:sticky;top:0;background:var(--bg);padding:6px 0;z-index:1}
</style></head><body>
<h1>Sound audition</h1>
<p>▶ plays a candidate, ✓ picks it (click again to unpick). "Keep synth" keeps today's generated sound. Picks are kept in this browser; copy the JSON at the bottom back to Claude.</p>
<div class="bar"><span id="count"></span></div>
<div id="list"></div>
<h2>Picks</h2><textarea id="out" readonly></textarea>
<script id="data" type="application/json">__DATA__</script>
<script>
const slots = JSON.parse(document.getElementById('data').textContent);
let picks = {};
try { picks = JSON.parse(localStorage.getItem('hk.audition') || '{}'); } catch {}
const audio = new Audio();
let playingBtn = null;
function play(src, btn) {
  if (playingBtn) playingBtn.classList.remove('playing');
  audio.src = src; audio.currentTime = 0; audio.play().catch(() => {});
  playingBtn = btn; btn.classList.add('playing');
}
audio.onended = () => playingBtn && playingBtn.classList.remove('playing');
function save() {
  try { localStorage.setItem('hk.audition', JSON.stringify(picks)); } catch {}
  document.getElementById('out').value = JSON.stringify(picks, null, 1);
  document.getElementById('count').textContent = Object.keys(picks).length + ' / ' + slots.length + ' picked';
}
const list = document.getElementById('list');
for (const s of slots) {
  const sec = document.createElement('section');
  sec.innerHTML = '<h2>' + s.key + ' <small>' + s.what + '</small></h2><div class="opts"></div>';
  const opts = sec.querySelector('.opts');
  const btns = [];
  const mark = () => { for (const b of btns) b.classList.toggle('on', b.dataset.v === picks[s.key]); sec.classList.toggle('done', !!picks[s.key]); };
  const add = (label, value) => {
    const wrap = document.createElement('span');
    if (value !== 'synth') {
      const p = document.createElement('button');
      p.textContent = '▶ ' + label; p.title = value;
      p.onclick = () => play(value, p);
      wrap.appendChild(p);
    }
    const b = document.createElement('button');
    b.textContent = value === 'synth' ? 'Keep synth' : '✓'; b.dataset.v = value;
    b.onclick = () => {
      if (picks[s.key] === value) delete picks[s.key]; else picks[s.key] = value;
      mark(); save();
    };
    wrap.appendChild(b);
    btns.push(b); opts.appendChild(wrap);
  };
  for (const f of s.files) add(f.split('/').pop().replace(/\\.(wav|ogg|mp3|flac)$/i, ''), f);
  if (!s.key.startsWith('music')) add('Synth', 'synth');
  mark(); list.appendChild(sec);
}
save();
</script></body></html>
"""

if __name__ == '__main__':
    main()
