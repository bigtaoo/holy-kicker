"""Replaces judge_v0's top hat with an official's winged gauze cap, drawn in code.
usage: python judge_cap.py judge_v0.png judge_v1.png"""
import sys
import numpy as np
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
SS = 4
im = Image.open(src).convert("RGB")
px = np.asarray(im).copy()
h, w = px.shape[:2]
yy, xx = np.mgrid[0:h, 0:w]
# erase the hat: everything above the head's top seam, and the brim's sides down past it
hat = ((yy < 252) & (xx > 345) & (xx < 870)) | ((yy < 290) & (xx > 345) & ((xx < 458) | (xx > 760)) & (yy < 290))
# keep the ears (light grey-green) below the brim
light = px.min(axis=2) > 140
hat &= ~((yy > 284) & light & ~(px.max(axis=2) > 235))
px[hat] = 255
base = Image.fromarray(px)

big = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(big)
s = lambda pts: [(x * SS, y * SS) for x, y in pts]
INK = (14, 16, 22, 255)
CAP = (34, 44, 58, 255)
CAP_HI = (58, 72, 92, 255)
OUT = 10 * SS

def paddle(x0, x1, y0, y1, grow):
    """A thin stem from (x0, y0) at the cap out to a flat oval paddle centred on (x1, y1)."""
    t = 9 + grow
    d.polygon(s([(x0, y0 - t), (x1, y1 - t), (x1, y1 + t), (x0, y0 + t)]), fill=INK if grow else CAP)
    rx, ry = 50 + grow, 24 + grow
    oval = Image.new("RGBA", ((2 * rx + 2) * SS, (2 * ry + 2) * SS), (0, 0, 0, 0))
    ImageDraw.Draw(oval).ellipse([SS, SS, (2 * rx + 1) * SS, (2 * ry + 1) * SS], fill=INK if grow else CAP)
    oval = oval.rotate(-12 if x1 > x0 else 12, resample=Image.BICUBIC, expand=True)
    big.alpha_composite(oval, (int(x1 * SS - oval.width / 2), int(y1 * SS - oval.height / 2)))

for x0, x1 in ((480, 385), (720, 835)):
    paddle(x0, x1, 200, 178, 9)
for x0, x1 in ((480, 385), (720, 835)):
    paddle(x0, x1, 200, 178, 0)
    d.line(s([(x1 - 30, 172 + (4 if x1 < x0 else -4)), (x1 + 30, 172 + (-4 if x1 < x0 else 4))]), fill=CAP_HI, width=4 * SS)

# the back lobe (taller, rounded) then the front band
d.rounded_rectangle(s([(500, 110), (700, 230)]), radius=90 * SS, fill=INK)
d.rounded_rectangle(s([(510, 120), (690, 222)]), radius=82 * SS, fill=CAP)
d.arc(s([(530, 132), (670, 200)]), 200, 300, fill=CAP_HI, width=6 * SS)
d.rounded_rectangle(s([(448, 186), (752, 266)]), radius=40 * SS, fill=INK)
d.rounded_rectangle(s([(458, 196), (742, 256)]), radius=30 * SS, fill=CAP)
d.line(s([(478, 212), (722, 212)]), fill=CAP_HI, width=5 * SS)
# a slate-purple jewel at the front
d.ellipse(s([(584, 216), (616, 248)]), fill=INK)
d.ellipse(s([(590, 222), (610, 242)]), fill=(84, 64, 120, 255))

cap = big.resize((w, h), Image.LANCZOS)
out = base.convert("RGBA")
out.alpha_composite(cap)
out.convert("RGB").save(dst)
