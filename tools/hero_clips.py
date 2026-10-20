"""Writes the squad's hero clips (idle, run, fire_l, fire_r, hurt) into the corgi's, the bulldog's
and the cat's specs, which share bone names (docs/reskin.md "Animation › Hero"). A rig with elbows
(fore_f / fore_n between arm and gun) carries the guns at the hips with bent arms; one without
keeps the straight-armed carry.
usage: python tools/hero_clips.py [name=value ...]   (overrides P below, e.g. lift=0.05)
then repack each rig with tools/pack_tao.py. Units are source px; the figures are ~735 px tall.

The clips are the carry pose and whole-body motion only: corgiHero.ts raises and aims the guns
over them (TaoActor.aim) and layers fire_l / fire_r / hurt additively, so those three are deltas
from rest."""
import json, os, sys

SPECS = ['art/reskin/corgi/corgi_tao.json', 'art/reskin/bulldog/bulldog_tao.json', 'art/reskin/cat/cat_tao.json']
H = 735
# lift: a step's height, bob: the body's rise at passing, sway: its shift over the planted foot
# (shares of H); roll: degrees the torso rolls toward that foot; head: degrees the head counter-rolls;
# arm: degrees the arms hang down from the A-pose; swing: their swing in the trot; gun: degrees the
# guns tip down in the carry; run: the trot's seconds per cycle (two steps); with elbows, arm_e and
# gun_e replace arm and gun, fore: degrees the forearms bend in, fswing: their lagging swing
P = dict(lift=0.04, bob=0.02, roll=3.5, sway=0.01, head=2, arm=65, swing=8, gun=25, run=0.5,
         arm_e=55, fore=35, gun_e=55, fswing=6)
for a in sys.argv[1:]:
    k, v = a.split('='); P[k] = float(v)

lift, bob, sway = P['lift'] * H, P['bob'] * H, P['sway'] * H
R, q = P['run'], P['run'] / 4


def clips(elbow):
    """The five clips for a rig with or without elbows."""
    ARM, GUN = (P['arm_e'], P['gun_e']) if elbow else (P['arm'], P['gun'])
    FORE = P['fore'] if elbow else 0

    def arms(k, a=0):
        """The carry, with the arms swung `a` degrees (the far arm mirrored); the forearms are
        keyed apart, so they can lag."""
        k.update({'arm_f': -ARM - a, 'arm_n': ARM - a, 'gun': GUN, 'gun_n': -GUN})
        return k

    def contact(t):
        return {'t': t, 'rotate': arms({'thigh_l': 0, 'thigh_r': 0, 'foot_l': 0, 'foot_r': 0, 'torso': 0}),
                'translate': {'root': [0, bob * 0.2], 'thigh_l': [0, 0], 'thigh_r': [0, 0], 'torso': [0, 0]},
                'scale': {'torso': [1.03, 0.97]}}

    def passing(t, side):
        """side -1: the left leg is up and the weight on the right one (the torso rolls right)."""
        up, down = ('thigh_l', 'thigh_r') if side < 0 else ('thigh_r', 'thigh_l')
        fup = 'foot_l' if side < 0 else 'foot_r'
        return {'t': t, 'rotate': arms({up: 4 if side < 0 else -4, down: 0, fup: 0, 'torso': -side * P['roll']},
                                       side * P['swing']),
                'translate': {'root': [0, -bob], up: [0, -lift], down: [0, 0], 'torso': [-side * sway, 0]},
                'scale': {'torso': [0.985, 1.02]}}

    # a front-view trot: each foot lifts in turn while the body rises, rolls and shifts over the other
    run_keys = [contact(0), passing(q, -1), contact(2 * q), passing(3 * q, 1), contact(R)]
    # the head rolls against the torso, and the forearms swing after the arms, an eighth of a cycle late
    lag = R / 8
    h, f = P['head'], P['fswing'] if elbow else 0

    def late(t, s):
        k = {'t': t, 'rotate': {'head': h * s}}
        if elbow:
            k['rotate'].update({'fore_f': -FORE - f * s, 'fore_n': FORE - f * s})
        return k
    run_keys += [late(0, 0.5), late(lag, 0), late(q + lag, -1), late(2 * q + lag, 0), late(3 * q + lag, 1), late(R, 0.5)]

    # breathing: the arms and tail drift, the body settles and swells
    idle_keys = []
    for t, s in ((0, 0), (1.0, 1), (2.0, 0)):
        k = {'head': s, 'tail': -4 + 10 * s, 'arm_n': ARM + 3 * s, 'arm_f': -ARM - 3 * s, 'gun': GUN, 'gun_n': -GUN}
        if elbow:
            k.update({'fore_f': -FORE - 4 * s, 'fore_n': FORE + 4 * s})
        idle_keys.append({'t': t, 'rotate': k, 'translate': {'root': [0, 5 * s]},
                          'scale': {'torso': [1 + 0.025 * s, 1 - 0.025 * s]}})
    return r2({'idle': {'duration': 2.0, 'loop': True, 'ease': 'ease-in-out', 'keys': idle_keys},
               'run': {'duration': R, 'loop': True, 'ease': 'ease-in-out', 'keys': run_keys},
               'fire_l': fire(-1), 'fire_r': fire(1), 'hurt': hurt})


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


for path in SPECS:
    with open(path, encoding='utf-8') as f:
        spec = json.load(f)
    with open(os.path.join(os.path.dirname(path), spec['rig']), encoding='utf-8') as f:
        rig = json.load(f)
    spec['animations'] = clips('fore_f' in rig['parent'])
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(spec, f, indent=1)
        f.write('\n')
    print(path)
