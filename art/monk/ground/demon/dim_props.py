"""Tones chapter 5's loud props (the cyan crystals, the cauldron's flame) down toward the cave stone,
so they stop competing with the teal-robed horde: cut out, saturation and the spread of
brightness are cut, the black outline is kept.
usage: python dim_props.py name... (reads <name>_v2.png, writes <name>_v3.png, already cut out)"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'tools'))
from cutout import cutout  # noqa: E402

SAT = 0.4       # saturation multiplier
SPREAD = 0.45   # brightness spread around MID
MID = 0.34      # the stone's brightness the props are pulled toward
OUTLINE = 0.16  # darker than this is ink and stays

for name in sys.argv[1:]:
    im = cutout(f'{name}_v2.png')
    alpha = im.getchannel('A')
    hsv = np.asarray(im.convert('RGB').convert('HSV'), dtype=np.float32) / 255
    v = hsv[..., 2]
    ink = v < OUTLINE
    hsv[..., 1] *= SAT
    hsv[..., 2] = np.where(ink, v, MID + (v - MID) * SPREAD)
    out = Image.fromarray((np.clip(hsv, 0, 1) * 255).round().astype(np.uint8), 'HSV').convert('RGB')
    out.putalpha(alpha)
    out.save(f'{name}_v3.png', optimize=True)
    print(name, out.size)
