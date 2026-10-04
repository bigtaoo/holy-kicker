"""Draws a seamless flagstone ground tile: staggered rows of uneven slabs with dark seams,
a few cracks, puddles and paper scraps, in flat colours (no generated picture needed).
usage: python flagstone_tile.py <out.png> [--size 512] [--seed 4] [--rgb 70,78,96]
Everything is drawn on a 3x3 canvas and the middle cut out, so slabs that cross an edge
wrap round to the other side."""
import argparse
import random

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("dst")
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--seed", type=int, default=4)
ap.add_argument("--rgb", default="70,78,96", help="the slabs' mean colour")
ap.add_argument("--colors", type=int, default=64)
a = ap.parse_args()

rnd = random.Random(a.seed)
N = a.size
base = tuple(int(v) for v in a.rgb.split(","))
SEAM = tuple(max(0, int(c * 0.55)) for c in base)
ROWS = 5
row_h = N // ROWS


def jitter(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


img = Image.new("RGB", (3 * N, 3 * N), SEAM)
d = ImageDraw.Draw(img)


def each(fn):
    """Calls fn(ox, oy) for the nine copies of the tile."""
    for ox in (0, N, 2 * N):
        for oy in (0, N, 2 * N):
            fn(ox, oy)


# slabs: each row is split into uneven widths that add up to the tile, with a random offset
slabs = []
for r in range(ROWS):
    widths, left = [], N
    while left > 0:
        w = min(left, rnd.choice((96, 112, 128, 144, 160)))
        if 0 < left - w < 72:
            w = left
        widths.append(w)
        left -= w
    x = rnd.randrange(N)
    for w in widths:
        slabs.append((x, r * row_h, w, row_h, rnd.uniform(0.9, 1.1)))
        x += w

for x, y, w, h, k in slabs:
    fill = jitter(base, k)
    shade = jitter(fill, 0.82)
    lite = jitter(fill, 1.1)

    def slab(ox, oy, x=x, y=y, w=w, h=h, fill=fill, shade=shade, lite=lite):
        x0, y0, x1, y1 = ox + x + 3, oy + y + 3, ox + x + w - 3, oy + y + h - 3
        d.rounded_rectangle((x0, y0, x1, y1), radius=10, fill=shade)
        # one hard cel shadow: the lower-right lip is the darker tone
        d.rounded_rectangle((x0, y0, x1 - 7, y1 - 7), radius=9, fill=fill)
        d.line((x0 + 10, y0 + 6, x0 + w * 0.35, y0 + 6), fill=lite, width=3)

    each(slab)

# cracks, puddles and paper scraps, a few of each
for _ in range(7):
    x, y = rnd.randrange(N), rnd.randrange(N)
    pts = [(x, y)]
    for _ in range(3):
        x += rnd.randint(-22, 22)
        y += rnd.randint(-22, 22)
        pts.append((x, y))
    each(lambda ox, oy, pts=pts: d.line([(px + ox, py + oy) for px, py in pts], fill=SEAM, width=3))
for _ in range(4):
    x, y = rnd.randrange(N), rnd.randrange(N)
    rx, ry = rnd.randint(22, 40), rnd.randint(10, 16)
    pool = jitter(base, 0.68)
    each(lambda ox, oy, x=x, y=y, rx=rx, ry=ry: d.ellipse((ox + x - rx, oy + y - ry, ox + x + rx, oy + y + ry), fill=pool))
    each(lambda ox, oy, x=x, y=y, rx=rx: d.line((ox + x - rx // 2, oy + y - 3, ox + x, oy + y - 3), fill=jitter(base, 0.95), width=3))
for _ in range(9):
    x, y = rnd.randrange(N), rnd.randrange(N)
    s = rnd.randint(7, 11)
    t = rnd.uniform(-0.5, 0.5)
    quad = [(x - s, y - s * 0.6 + t * s), (x + s, y - s * 0.6 - t * s), (x + s, y + s * 0.6 - t * s), (x - s, y + s * 0.6 + t * s)]
    paper = jitter((124, 130, 146), rnd.uniform(0.85, 1.0))
    each(lambda ox, oy, quad=quad, paper=paper: d.polygon([(px + ox, py + oy) for px, py in quad], fill=paper))

tile = img.crop((N, N, 2 * N, 2 * N))
tile.quantize(colors=a.colors).save(a.dst, optimize=True)
print(f"{a.dst} {N}x{N}")
