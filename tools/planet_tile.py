"""Draws a seamless planet-surface ground tile in flat cel colours (no generated picture needed).
usage: python planet_tile.py <style> <out.png> [--size 512] [--seed 1] [--rgb R,G,B] [--soft]
styles:
  frost     icy moon dust: blotches of frost, shallow craters, pale streaks, ice pebbles
  regolith  cracked moon rock: packed dust split by a network of fine cracks, pebbles, pits
  spore     alien jungle floor: moss blotches, dark mud pools, fungus caps, pale spore dots
  dune      desert sand: wind ripples bent by noise, a few flat pebbles
--rgb sets the mean colour (each style has its own); --soft halves the contrast (the
earth_soft ground). Noise comes from random spectra (periodic by construction) and the shapes
are drawn on every wrapped copy, so the tile repeats with no seam."""
import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw

STYLES = {"frost": "70,82,100", "regolith": "80,80,84", "spore": "58,70,44", "dune": "112,92,64"}

ap = argparse.ArgumentParser()
ap.add_argument("style", choices=STYLES)
ap.add_argument("dst")
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--rgb", default="")
ap.add_argument("--soft", action="store_true")
ap.add_argument("--colors", type=int, default=64)
a = ap.parse_args()

rnd = random.Random(a.seed)
nrng = np.random.default_rng(a.seed)
N = a.size
base = np.array([int(v) for v in (a.rgb or STYLES[a.style]).split(",")], np.float32)
K = 0.5 if a.soft else 1.0  # contrast


def noise(scale):
    """Periodic smooth noise in -1..1, features about N/scale across."""
    f = np.fft.fftfreq(N)[:, None] ** 2 + np.fft.fftfreq(N)[None, :] ** 2
    spec = np.fft.fft2(nrng.standard_normal((N, N))) * np.exp(-f * (N / scale) ** 2)
    n = np.real(np.fft.ifft2(spec))
    return n / np.abs(n).max()


def bands(n, cuts, shades):
    """Posterises noise into flat steps: shades[i] where n falls between cuts."""
    out = np.full(n.shape, shades[0], np.float32)
    for c, s in zip(cuts, shades[1:]):
        out[n > c] = s
    return out


def tone(m):
    return 1 + (m - 1) * K


img = None
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
if a.style == "dune":
    warp = noise(3) * 1.6 + noise(8) * 0.3
    ripple = np.sin(2 * math.pi * (yy / N * 9 + xx / N * 2) + warp * 4)
    shade = bands(noise(4), [-0.25, 0.3], [0.92, 1.0, 1.06])
    shade = np.where(ripple > 0.88, shade * tone(0.9), shade)  # the ripple's shadowed lip
    shade = np.where((ripple > 0.55) & (ripple <= 0.88), shade * tone(1.06), shade)
    img = base * shade[..., None]
else:
    big = noise(3)
    cuts = {"frost": ([-0.3, 0.25], [0.9, 1.0, 1.1]), "regolith": ([-0.2, 0.35], [0.92, 1.0, 1.07]),
            "spore": ([-0.35, 0.1, 0.5], [0.86, 0.95, 1.03, 1.1])}[a.style]
    shade = bands(big + noise(9) * 0.25, cuts[0], [tone(s) for s in cuts[1]])
    img = base * shade[..., None]
    if a.style == "frost":
        frost = noise(5)
        img = np.where((frost > 0.55)[..., None], img * 0.7 + np.array([190, 205, 220]) * 0.3 * K + img * 0.3 * (1 - K), img)
    if a.style == "spore":
        mud = noise(5) + noise(14) * 0.2
        rim = (mud < -0.4)[..., None]
        img = np.where(rim, base * np.array([1.05, 0.95, 0.85]) * tone(0.9), img)
        img = np.where((mud < -0.48)[..., None], base * np.array([0.95, 0.8, 0.75]) * tone(0.72), img)

out = Image.fromarray(img.clip(0, 255).astype(np.uint8), "RGB")
dr = ImageDraw.Draw(out)


def rgb(m, tint=(0, 0, 0), mix=0.0):
    c = base * tone(m) * (1 - mix) + np.array(tint) * mix
    return tuple(int(v) for v in c.clip(0, 255))


def wrapped(fn):
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            fn(ox, oy)


def scatter(count, fn):
    for _ in range(count):
        x, y = rnd.uniform(0, N), rnd.uniform(0, N)
        args = fn(x, y)
        wrapped(lambda ox, oy, x=x, y=y, args=args: args(x + ox, y + oy))


def crater(r):
    rim, pit = rgb(1.12), rgb(0.82)

    def draw(x, y):
        dr.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=rim)
        dr.ellipse([x - r * 0.8, y - r * 0.6, x + r * 0.8, y + r * 0.66], fill=pit)
        dr.chord([x - r * 0.8, y - r * 0.6, x + r * 0.8, y + r * 0.66], 200, 340, fill=rgb(0.7))
    return draw


def pebble(r, m, outline=0.6):
    def draw(x, y):
        dr.ellipse([x - r - 1.5, y - r * 0.7 - 1.5, x + r + 1.5, y + r * 0.7 + 1.5], fill=rgb(outline))
        dr.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=rgb(m))
        dr.ellipse([x - r * 0.5, y - r * 0.5, x + r * 0.1, y - r * 0.05], fill=rgb(m * 1.08))
    return draw


def crack(length, m):
    pts = [(0.0, 0.0)]
    ang = rnd.uniform(0, 2 * math.pi)
    for _ in range(length):
        ang += rnd.uniform(-0.8, 0.8)
        pts.append((pts[-1][0] + math.cos(ang) * 14, pts[-1][1] + math.sin(ang) * 14))

    def draw(x, y):
        dr.line([(x + px, y + py) for px, py in pts], fill=rgb(m), width=2)
    return draw


if a.style == "frost":
    for _ in range(4):
        scatter(1, lambda x, y: crater(rnd.uniform(26, 44)))
    scatter(9, lambda x, y: crater(rnd.uniform(8, 14)))
    scatter(26, lambda x, y: pebble(rnd.uniform(2.5, 5), 1.3, 0.75))
    scatter(14, lambda x, y: crack(rnd.randint(2, 4), 0.7))
elif a.style == "regolith":
    scatter(34, lambda x, y: crack(rnd.randint(3, 7), 0.62))
    scatter(6, lambda x, y: crater(rnd.uniform(9, 16)))
    scatter(30, lambda x, y: pebble(rnd.uniform(3, 6), 1.08))
elif a.style == "spore":
    def cap(x0, y0):
        r = rnd.uniform(5, 9)
        stem, top = rgb(1.25, (200, 190, 160), 0.4), rgb(0.95, (120, 80, 50), 0.5)

        def draw(x, y):
            dr.ellipse([x - r - 1.5, y - r * 0.6 - 1.5, x + r + 1.5, y + r * 0.6 + 1.5], fill=rgb(0.5))
            dr.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=top)
            dr.ellipse([x - r * 0.3, y - r * 0.3, x + r * 0.2, y], fill=stem)
        return draw
    scatter(22, cap)
    scatter(60, lambda x, y: (lambda x, y: dr.ellipse([x - 1.6, y - 1.6, x + 1.6, y + 1.6], fill=rgb(1.6, (200, 220, 170), 0.5))))
    scatter(14, lambda x, y: pebble(rnd.uniform(3, 5), 0.9))
elif a.style == "dune":
    scatter(12, lambda x, y: pebble(rnd.uniform(3, 6), 0.9, 0.62))

out.quantize(a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(a.dst, optimize=True)
print(a.dst, f"{N}x{N}")
