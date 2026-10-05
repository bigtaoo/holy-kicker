"""Pack the fat monk and the novice on the hero's animations (art/monk/rig/hero_tao.json).
usage: python make_tao.py   (from this folder; writes <monk>.tao and client/public/art/monks/<monk>/)

Each monk is split from an edit_image of the hero's A-pose (<monk>_v1.png, <monk>_parts.json),
so the hero's bones and clips fit; a bone the monk has no part for (the novice wears no
beads) is dropped from the clips. The face variants come from face_variant.py
(<monk>_face_hurt_v1.png, <monk>_face_strain_v1.png); a missing one falls back to the face.
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, '..', '..', '..', 'tools')
OUT = os.path.join(HERE, '..', '..', '..', 'client', 'public', 'art', 'monks')
MONKS = {'fat': {'origin': [590, 842], 'scale': 0.35}, 'novice': {'origin': [598, 842], 'scale': 0.32}}

hero = json.load(open(os.path.join(HERE, '..', 'rig', 'hero_tao.json'), encoding='utf-8'))
for monk, opt in MONKS.items():
    parts = f'{monk}_parts'
    subprocess.run([sys.executable, os.path.join(TOOLS, 'split_parts.py'), f'{monk}_parts.json', parts], check=True, cwd=HERE)
    names = {p['name'] for p in json.load(open(os.path.join(HERE, parts, 'parts.json')))['parts']}
    for v in ('face_hurt', 'face_strain'):
        src = os.path.join(HERE, f'{monk}_{v}_v1.png')
        out = os.path.join(HERE, parts, v + '.png')
        if os.path.exists(src):
            subprocess.run([sys.executable, os.path.join(TOOLS, 'face_variant.py'), f'{monk}_parts.json', parts, src, out], check=True, cwd=HERE)
        else:
            shutil.copy(os.path.join(HERE, parts, 'face.png'), out)
    anims = json.loads(json.dumps(hero['animations']))
    for a in anims.values():
        for k in a['keys']:
            for ch in ('rotate', 'translate', 'scale'):
                if ch in k:
                    k[ch] = {b: v for b, v in k[ch].items() if b in names or b == 'root'}
    spec = {**hero, 'name': monk, 'parts': parts, 'rig': '../rig/rig_v3.json', **opt, 'animations': anims}
    path = os.path.join(HERE, f'{monk}_tao.json')
    json.dump(spec, open(path, 'w', encoding='utf-8'), indent=1)
    subprocess.run([sys.executable, os.path.join(TOOLS, 'pack_tao.py'), path, os.path.join(HERE, f'{monk}.tao'), os.path.join(OUT, monk)], check=True, cwd=HERE)
