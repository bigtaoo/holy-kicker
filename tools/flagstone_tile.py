"""Draws a seamless flagstone ground tile: staggered rows of uneven slabs with dark seams,
a few cracks, puddles and paper scraps, in flat colours (no generated picture needed).
usage: python flagstone_tile.py <out.png> [--size 512] [--seed 4] [--rgb 70,78,96] [--seam 0.55]
       [--relief 1] [--wear 0]
--size draws the same street at another resolution (1024: every stroke twice as many pixels, for a
tile the game shows at half the world units per pixel, so it stays crisp on a phone).
--wear adds road texture: that many more cracks, chipped corners and pebbles per slab row.
--relief scales every tone's distance from the slab colour (seams, lips, puddles, scraps): below 1
flattens the street so the characters on it read first.
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
ap.add_argument("--seam", type=float, default=0.55, help="the seams' and cracks' share of the slab colour")
ap.add_argument("--relief", type=float, default=1.0, help="how far the other tones stray from the slab colour")
ap.add_argument("--wear", type=int, default=0, help="extra cracks, chips and pebbles per row")
ap.add_argument("--colors", type=int, default=64)
a = ap.parse_args()

rnd = random.Random(a.seed)
N = a.size
U = N / 512  # pixels per pixel of the 512 tile the sizes below were drawn for


def u(v):
    return round(v * U)

base = tuple(int(v) for v in a.rgb.split(","))


def jitter(c, k):
    k = 1 + (k - 1) * a.relief if a.relief != 1 else k
    return tuple(max(0, min(255, int(v * k))) for v in c)


SEAM = jitter(base, a.seam)
ROWS = 5
row_h = N // ROWS

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
        w = min(left, u(rnd.choice((96, 112, 128, 144, 160))))
        if 0 < left - w < u(72):
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
        x0, y0, x1, y1 = ox + x + u(3), oy + y + u(3), ox + x + w - u(3), oy + y + h - u(3)
        d.rounded_rectangle((x0, y0, x1, y1), radius=u(10), fill=shade)
        # one hard cel shadow: the lower-right lip is the darker tone
        d.rounded_rectangle((x0, y0, x1 - u(7), y1 - u(7)), radius=u(9), fill=fill)
        d.line((x0 + u(10), y0 + u(6), x0 + w * 0.35, y0 + u(6)), fill=lite, width=u(3))

    each(slab)

# cracks, puddles and paper scraps, a few of each
for _ in range(7):
    x, y = rnd.randrange(N), rnd.randrange(N)
    pts = [(x, y)]
    for _ in range(3):
        x += u(rnd.randint(-22, 22))
        y += u(rnd.randint(-22, 22))
        pts.append((x, y))
    each(lambda ox, oy, pts=pts: d.line([(px + ox, py + oy) for px, py in pts], fill=SEAM, width=u(3)))
for _ in range(4):
    x, y = rnd.randrange(N), rnd.randrange(N)
    rx, ry = u(rnd.randint(22, 40)), u(rnd.randint(10, 16))
    pool = jitter(base, 0.68)
    each(lambda ox, oy, x=x, y=y, rx=rx, ry=ry: d.ellipse((ox + x - rx, oy + y - ry, ox + x + rx, oy + y + ry), fill=pool))
    each(lambda ox, oy, x=x, y=y, rx=rx: d.line((ox + x - rx // 2, oy + y - u(3), ox + x, oy + y - u(3)), fill=jitter(base, 0.95), width=u(3)))
# road texture (--wear): hairline cracks off the slab edges, chipped corners and loose pebbles,
# drawn from their own random stream so the street's layout stays as it was
wear = random.Random(a.seed + 1000)
for _ in range(a.wear * ROWS):
    x, y = wear.randrange(N), wear.randrange(N)
    pts = [(x, y)]
    for _ in range(wear.randint(2, 4)):
        x += u(wear.randint(-16, 16))
        y += u(wear.randint(-10, 10))
        pts.append((x, y))
    each(lambda ox, oy, pts=pts: d.line([(px + ox, py + oy) for px, py in pts], fill=jitter(base, 0.75), width=u(2)))
for _ in range(a.wear * ROWS):
    x, y = wear.randrange(N), wear.randrange(N)
    s = u(wear.randint(4, 8))
    dark = jitter(base, 0.8)
    each(lambda ox, oy, x=x, y=y, s=s, dark=dark: d.polygon([(ox + x, oy + y), (ox + x + s, oy + y), (ox + x, oy + y + s)], fill=dark))
for _ in range(2 * a.wear * ROWS):
    x, y = wear.randrange(N), wear.randrange(N)
    r = u(wear.randint(3, 6))
    stone, rim = jitter(base, 1.12), jitter(base, 0.78)
    each(lambda ox, oy, x=x, y=y, r=r, stone=stone, rim=rim: (
        d.ellipse((ox + x - r, oy + y - r * 0.7 + u(2), ox + x + r, oy + y + r * 0.7 + u(2)), fill=rim),
        d.ellipse((ox + x - r, oy + y - r * 0.7, ox + x + r, oy + y + r * 0.7), fill=stone)))
for _ in range(9):
    x, y = rnd.randrange(N), rnd.randrange(N)
    s = u(rnd.randint(7, 11))
    t = rnd.uniform(-0.5, 0.5)
    quad = [(x - s, y - s * 0.6 + t * s), (x + s, y - s * 0.6 - t * s), (x + s, y + s * 0.6 - t * s), (x - s, y + s * 0.6 + t * s)]
    k = rnd.uniform(0.85, 1.0)
    paper = tuple(int(b + (int(p * k) - b) * a.relief) for b, p in zip(base, (124, 130, 146)))
    each(lambda ox, oy, quad=quad, paper=paper: d.polygon([(px + ox, py + oy) for px, py in quad], fill=paper))

tile = img.crop((N, N, 2 * N, 2 * N))
tile.quantize(colors=a.colors).save(a.dst, optimize=True)
print(f"{a.dst} {N}x{N}")
