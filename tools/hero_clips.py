"""Writes the squad's hero clips (idle, run, fire_l, fire_r, hurt) into the corgi's, the bulldog's
and the cat's specs, which share bone names (docs/reskin.md "Animation › Hero").
usage: python tools/hero_clips.py [name=value ...]   (overrides P below, e.g. lift=0.05)
then repack each rig with tools/pack_tao.py. Units are source px; the figures are ~735 px tall.

The clips are the carry pose and whole-body motion only: corgiHero.ts raises and aims the guns
over them (TaoActor.aim) and layers fire_l / fire_r / hurt additively, so those three are deltas
from rest."""
import json, sys

SPECS = ['art/reskin/corgi/corgi_tao.json', 'art/reskin/bulldog/bulldog_tao.json', 'art/reskin/cat/cat_tao.json']
H = 735
# lift: a step's height, bob: the body's rise at passing, sway: its shift over the planted foot
# (shares of H); roll: degrees the torso rolls toward that foot; head: degrees the head counter-rolls;
# arm: degrees the arms hang down from the A-pose; swing: their swing in the trot; gun: degrees the
# guns tip down in the carry; run: the trot's seconds per cycle (two steps)
P = dict(lift=0.04, bob=0.02, roll=3.5, sway=0.01, head=2, arm=65, swing=8, gun=25, run=0.5)
for a in sys.argv[1:]:
    k, v = a.split('='); P[k] = float(v)

ARM, GUN = P['arm'], P['gun']
lift, bob, sway = P['lift'] * H, P['bob'] * H, P['sway'] * H
R, q = P['run'], P['run'] / 4


def contact(t):
    return {'t': t, 'rotate': {'thigh_l': 0, 'thigh_r': 0, 'foot_l': 0, 'foot_r': 0, 'torso': 0,
                               'arm_f': -ARM, 'arm_n': ARM, 'gun': GUN, 'gun_n': -GUN},
            'translate': {'root': [0, bob * 0.2], 'thigh_l': [0, 0], 'thigh_r': [0, 0], 'torso': [0, 0]},
            'scale': {'torso': [1.03, 0.97]}}


def passing(t, side):
    """side -1: the left leg is up and the weight on the right one (the torso rolls right)."""
    up, down = ('thigh_l', 'thigh_r') if side < 0 else ('thigh_r', 'thigh_l')
    fup = 'foot_l' if side < 0 else 'foot_r'
    return {'t': t, 'rotate': {up: 4 if side < 0 else -4, down: 0, fup: 0,
                               'torso': -side * P['roll'],
                               'arm_f': -ARM + side * -P['swing'], 'arm_n': ARM + side * -P['swing'],
                               'gun': GUN, 'gun_n': -GUN},
            'translate': {'root': [0, -bob], up: [0, -lift], down: [0, 0], 'torso': [-side * sway, 0]},
            'scale': {'torso': [0.985, 1.02]}}


# a front-view trot: each foot lifts in turn while the body rises, rolls and shifts over the other
run_keys = [contact(0), passing(q, -1), contact(2 * q), passing(3 * q, 1), contact(R)]
# the head rolls against the torso, an eighth of a cycle late
lag = R / 8
h = P['head']
run_keys += [{'t': 0, 'rotate': {'head': h / 2}}, {'t': lag, 'rotate': {'head': 0}}, {'t': q + lag, 'rotate': {'head': -h}},
             {'t': 2 * q + lag, 'rotate': {'head': 0}}, {'t': 3 * q + lag, 'rotate': {'head': h}}, {'t': R, 'rotate': {'head': h / 2}}]

# breathing: the arms and tail drift, the body settles and swells
idle_keys = []
for t, s in ((0, 0), (1.0, 1), (2.0, 0)):
    idle_keys.append({'t': t, 'rotate': {'head': s, 'tail': -4 + 10 * s, 'arm_n': ARM + 3 * s, 'arm_f': -ARM - 3 * s,
                                         'gun': GUN, 'gun_n': -GUN},
                      'translate': {'root': [0, 5 * s]}, 'scale': {'torso': [1 + 0.025 * s, 1 - 0.025 * s]}})


def fire(side):
    """side -1 shoots left: the kick tips the body right."""
    s = -side
    return {'duration': 0.22, 'loop': False, 'keys': [
        {'t': 0, 'rotate': {'torso': 0, 'head': 0}, 'translate': {'torso': [0, 0]}, 'scale': {'torso': [1, 1]}, 'ease': 'ease-out'},
        {'t': 0.04, 'rotate': {'torso': 4 * s, 'head': -3 * s}, 'translate': {'torso': [0.01 * H * s, 0]}, 'scale': {'torso': [1.03, 0.96]}, 'ease': 'ease-in-out'},
        {'t': 0.13, 'rotate': {'torso': -1 * s, 'head': 1 * s}, 'translate': {'torso': [-0.002 * H * s, 0]}, 'scale': {'torso': [0.99, 1.01]}, 'ease': 'ease-in-out'},
        {'t': 0.22, 'rotate': {'torso': 0, 'head': 0}, 'translate': {'torso': [0, 0]}, 'scale': {'torso': [1, 1]}}]}


# a hit: the body squashes down and the head tips, then a small rebound
hurt = {'duration': 0.3, 'loop': False, 'keys': [
    {'t': 0, 'rotate': {'torso': 0, 'head': 0}, 'translate': {'root': [0, 0]}, 'scale': {'torso': [1, 1]}, 'ease': 'ease-out'},
    {'t': 0.05, 'rotate': {'torso': -2, 'head': 8}, 'translate': {'root': [0, 0.02 * H]}, 'scale': {'torso': [1.05, 0.94]}, 'ease': 'ease-in-out'},
    {'t': 0.17, 'rotate': {'torso': 0.5, 'head': -2}, 'translate': {'root': [0, -0.004 * H]}, 'scale': {'torso': [0.98, 1.02]}, 'ease': 'ease-in-out'},
    {'t': 0.3, 'rotate': {'torso': 0, 'head': 0}, 'translate': {'root': [0, 0]}, 'scale': {'torso': [1, 1]}}]}


def r2(o):
    if isinstance(o, float): return round(o, 2)
    if isinstance(o, dict): return {k: r2(v) for k, v in o.items()}
    if isinstance(o, list): return [r2(v) for v in o]
    return o


clips = r2({
    'idle': {'duration': 2.0, 'loop': True, 'ease': 'ease-in-out', 'keys': idle_keys},
    'run': {'duration': R, 'loop': True, 'ease': 'ease-in-out', 'keys': run_keys},
    'fire_l': fire(-1), 'fire_r': fire(1), 'hurt': hurt})
for path in SPECS:
    with open(path, encoding='utf-8') as f:
        spec = json.load(f)
    spec['animations'] = clips
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(spec, f, indent=1)
        f.write('\n')
    print(path)
