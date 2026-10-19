"""Draws a seamless honeycomb ground tile: hex cells of resin with dark walls, some cells
capped darker, a few faintly lit, in flat colours with a hard shadow inside each wall.
usage: python hex_tile.py <out.png> [--size 512] [--cols 6] [--rows 8] [--seed 3]
                          [--rgb 92,66,40] [--glow 120,96,56] [--colors 64]
The cell centres sit on a torus (cols across, an even number of rows down), so the cells
crossing an edge wrap round to the other side. The cells are a little squashed when
rows x 0.75 hex heights does not match the size exactly, which no one sees."""
import argparse
import random

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("dst")
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--cols", type=int, default=6)
ap.add_argument("--rows", type=int, default=8)
ap.add_argument("--seed", type=int, default=3)
ap.add_argument("--rgb", default="92,66,40", help="the resin's mean colour")
ap.add_argument("--glow", default="120,96,56", help="the colour of the few lit cells")
ap.add_argument("--colors", type=int, default=64)
a = ap.parse_args()
if a.rows % 2:
    raise SystemExit("--rows must be even so the staggered rows wrap")

rnd = random.Random(a.seed)
S = 2  # drawn at twice the size, then scaled down for smooth walls
N = a.size * S
base = np.array([int(v) for v in a.rgb.split(",")], np.float32)
glow = np.array([int(v) for v in a.glow.split(",")], np.float32)
dx, dy = N / a.cols, N / a.rows
centres = [((c + 0.5 * (r % 2)) * dx, (r + 0.5) * dy) for r in range(a.rows) for c in range(a.cols)]

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
d1 = np.full((N, N), np.inf, np.float32)
d2 = np.full((N, N), np.inf, np.float32)
owner = np.zeros((N, N), np.int32)
for k, (cx, cy) in enumerate(centres):
    # nearest copy of this centre on the torus
    ddx = np.abs(xx - cx)
    ddx = np.minimum(ddx, N - ddx)
    ddy = np.abs(yy - cy)
    ddy = np.minimum(ddy, N - ddy)
    d = np.hypot(ddx, ddy)
    closer = d < d1
    d2 = np.where(closer, d1, np.minimum(d2, d))
    owner = np.where(closer, k, owner)
    d1 = np.where(closer, d, d1)
edge = (d2 - d1) / 2  # distance to the wall between the two nearest cells

# each cell: a shade, capped (darker, flat) or lit (a dull glow in the middle)
kind = [rnd.choices(["open", "capped", "lit"], [0.72, 0.2, 0.08])[0] for _ in centres]
shade = np.array([rnd.uniform(0.88, 1.08) for _ in centres], np.float32)
cell = shade[owner][..., None] * base
capped = np.array([k == "capped" for k in kind])[owner]
lit = np.array([k == "lit" for k in kind])[owner]
cell = np.where(capped[..., None], cell * 0.8, cell)
r = d1 / (dy * 0.62)  # 0 in the middle of a cell, about 1 at its wall
cell = np.where((lit & (r < 0.7))[..., None], cell * 0.6 + glow * 0.4, cell)  # dull, never a coin-like dot
cell = np.where((~capped & ~lit & (r < 0.45))[..., None], cell * 0.93, cell)  # the open cell's hollow

wall = 5 * S
img = np.where((edge < wall)[..., None], base * 0.58, cell)
# a hard cel shadow along the upper-left inside of each wall
sx = xx - np.array([c[0] for c in centres], np.float32)[owner]
sy = yy - np.array([c[1] for c in centres], np.float32)[owner]
sx = (sx + N / 2) % N - N / 2
sy = (sy + N / 2) % N - N / 2
upper_left = (sx + sy) < 0
img = np.where(((edge >= wall) & (edge < wall + 4 * S) & upper_left)[..., None], img * 0.78, img)

out = Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((a.size, a.size), Image.LANCZOS)
out.quantize(a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(a.dst, optimize=True)
print(a.dst, out.size)
