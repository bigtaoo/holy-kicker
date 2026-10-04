"""Draws a seamless cave-floor tile: irregular rock plates (a Voronoi diagram on a torus, so the
plates wrap across the edges) with dark cracks between them, a lighter cel lip along each plate's
upper edge, a few hairline cracks and small glowing embers, in flat colours.
usage: python rock_tile.py <out.png> [--size 512] [--seed 5] [--rgb 50,48,64] [--plates 34]
       [--ember 150,90,230] [--embers 14]"""
import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("dst")
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--seed", type=int, default=5)
ap.add_argument("--rgb", default="50,48,64", help="the plates' mean colour")
ap.add_argument("--plates", type=int, default=34)
ap.add_argument("--ember", default="150,90,230")
ap.add_argument("--embers", type=int, default=14)
ap.add_argument("--colors", type=int, default=64)
a = ap.parse_args()

rnd = random.Random(a.seed)
N = a.size
base = np.array([int(v) for v in a.rgb.split(",")], np.float64)
ember = tuple(int(v) for v in a.ember.split(","))

# sites spread by rejection so plates come out of similar size
sites = []
min_d = N / math.sqrt(a.plates) * 0.7
while len(sites) < a.plates:
    p = (rnd.uniform(0, N), rnd.uniform(0, N))
    if all(min(abs(p[0] - q[0]), N - abs(p[0] - q[0])) ** 2 + min(abs(p[1] - q[1]), N - abs(p[1] - q[1])) ** 2 > min_d ** 2 for q in sites):
        sites.append(p)
sx = np.array([p[0] for p in sites])
sy = np.array([p[1] for p in sites])

yy, xx = np.mgrid[0:N, 0:N].astype(np.float64)
# wrapped offsets to every site: (N, N, plates)
dx = (xx[..., None] - sx + N / 2) % N - N / 2
dy = (yy[..., None] - sy + N / 2) % N - N / 2
d = np.hypot(dx, dy)
order = np.argsort(d, axis=-1)
near = order[..., 0]
d1 = np.take_along_axis(d, order[..., :1], -1)[..., 0]
d2 = np.take_along_axis(d, order[..., 1:2], -1)[..., 0]
gap = d2 - d1

shade = np.array([rnd.uniform(0.82, 1.12) for _ in sites])
img = base * shade[near][..., None]
# the lip: just inside the crack on the plate's upper side
up = np.take_along_axis(dy, near[..., None], -1)[..., 0] < 0
lip = (gap >= 5) & (gap < 11) & up
img[lip] = np.minimum(255, img[lip] * 1.28)
img[gap < 5] = base * 0.42

out = Image.fromarray(img.astype(np.uint8), "RGB")
dr = ImageDraw.Draw(out)
seam = tuple(int(c * 0.42) for c in base)


def wrapped(fn):
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            fn(ox, oy)


# hairline cracks inside some plates
for i, (px, py) in enumerate(sites):
    if rnd.random() < 0.45:
        pts = [(px + rnd.uniform(-20, 20), py + rnd.uniform(-20, 20))]
        for _ in range(3):
            pts.append((pts[-1][0] + rnd.uniform(-18, 18), pts[-1][1] + rnd.uniform(-18, 18)))
        wrapped(lambda ox, oy: dr.line([(x + ox, y + oy) for x, y in pts], fill=seam, width=2))
# embers: a dark socket with a glowing core
for _ in range(a.embers):
    ex, ey, r = rnd.uniform(0, N), rnd.uniform(0, N), rnd.uniform(3, 6)
    glow = tuple(int(c * 0.55) for c in ember)

    def put(ox, oy, ex=ex, ey=ey, r=r):
        dr.ellipse([ex + ox - r - 2, ey + oy - r - 2, ex + ox + r + 2, ey + oy + r + 2], fill=seam)
        dr.ellipse([ex + ox - r, ey + oy - r, ex + ox + r, ey + oy + r], fill=glow)
        dr.ellipse([ex + ox - r * 0.5, ey + oy - r * 0.5, ex + ox + r * 0.5, ey + oy + r * 0.5], fill=ember)
    wrapped(put)

out.quantize(a.colors, method=Image.Quantize.MEDIANCUT).save(a.dst, optimize=True)
print(a.dst, f"{N}x{N}")
