"""Contact sheet of the rest-face candidates at game size (docs/reskin.md "Animation › Hero").
usage: python art/reskin/corgi/faces2/sheet.py <out.png> <base drawing> <label>=<redraw aligned to the base> ...
Each redraw goes through split_parts.refaced (only the face zone changes, as in the rig), then is
shown as a close-up and as the whole hero at 70 px (desktop, 1x) and 130 px tall (a phone at 3x)
on the first planet's ground."""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', 'tools'))
from split_parts import refaced  # noqa: E402
from cutout import background_mask  # noqa: E402
from PIL import ImageChops  # noqa: E402

HERE = os.path.join(os.path.dirname(__file__), '..')
ZONE = [565, 345, 190, 135]
base = Image.open(os.path.join(HERE, sys.argv[2])).convert('RGB')
rgb = np.array(base)
alpha = np.array(ImageChops.invert(background_mask(base)))
ground = Image.open(os.path.join(HERE, 'game', 'art', 'ground', 'grass.png')).convert('RGB')

cols = [('rest', rgb)] + [(a.split('=')[0], refaced(rgb, rgb, np.array(Image.open(a.split('=')[1]).convert('RGB')), ZONE).astype(np.uint8)) for a in sys.argv[3:]]
CW, CLOSE = 300, 300
sheet = Image.new('RGB', (CW * len(cols), 40 + CLOSE + 330), (40, 44, 52))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('arial.ttf', 24)
for i, (label, im) in enumerate(cols):
    x = i * CW
    d.text((x + 12, 8), label, fill='white', font=font)
    fig = Image.fromarray(np.dstack([im, alpha]).astype(np.uint8), 'RGBA')
    head = fig.crop((330, 120, 800, 520)).resize((CLOSE, round(CLOSE * 400 / 470)), Image.LANCZOS)
    sheet.paste(Image.new('RGB', head.size, 'white'), (x, 40))
    sheet.paste(head, (x, 40), head)
    tile = ground.crop((0, 0, CW, 330)) if ground.width >= CW else ground.resize((CW, 330))
    sheet.paste(tile, (x, 40 + CLOSE))
    box = fig.getbbox()
    body = fig.crop(box)
    for h, (ox, oy) in ((70, (20, 120)), (130, (110, 60))):
        small = body.resize((round(body.width * h / body.height), h), Image.LANCZOS)
        sheet.paste(small, (x + ox, 40 + CLOSE + oy), small)
    d.line([(x, 0), (x, sheet.height)], fill=(20, 20, 20), width=2)
sheet.save(sys.argv[1])
