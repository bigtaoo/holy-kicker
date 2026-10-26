"""Gameplay-forward corgi covers: the corgi in the middle of a ring of bugs closing in, glowing bolts
fanning out from both guns, front-rank bugs bursting, XP gems on the ground and damage numbers.
A collage of the corgi build's own sprites, like tools/cover_horde_ref.py does for the monk.
usage: python tools/cover_corgi_horde.py <out dir>"""
import json

import numpy as np
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from cutout import cutout  # noqa: E402

CORGI = ROOT / "art" / "reskin" / "corgi"
GAME = CORGI / "game" / "art"
FONT = str(ROOT / "client" / "public" / "art" / "fonts" / "LilitaOne-Regular.ttf")
INK = (20, 16, 24, 255)
BOLT = (215, 255, 70, 255)
GEM = (255, 110, 200, 255)
# teal beetle, purple spider, purple beetle, tick, squid: chapter 1 and 2 bugs, cold colours only
MOBS = ["mobs/jiangshi", "mobs/fox", "ch2/mobs/toad", "mobs/jiangshi", "ch3/mobs/icewraith", "ch2/mobs/toad"]

# name: size, corgi centre (fractions), corgi height (u = short side), ring radii (u), bugs
LAYOUTS = {
    "landscape": ((1920, 1080), (0.5, 0.56), 0.40, (0.60, 0.40), 46),
    "portrait": ((1080, 1920), (0.5, 0.56), 0.46, (0.40, 0.62), 50),
    "square": ((800, 800), (0.5, 0.56), 0.40, (0.40, 0.38), 40),
}


def sheet(name):
    meta = json.loads((GAME / f"{name}.json").read_text())
    im = Image.open(GAME / f"{name}.png").convert("RGBA")
    return meta, im


def frame(name, i=0):
    meta, im = sheet(name)
    w, h, cols = meta["frameW"], meta["frameH"], meta["cols"]
    f = im.crop((i % cols * w, i // cols * h, i % cols * w + w, i // cols * h + h))
    return f.crop(f.getbbox())


def hit_frame(name, i=0):
    """The white hit-flash frame of a bug, as the game draws it when a bolt lands."""
    meta, _ = sheet(name)
    return frame(name, meta["frames"] + i % meta["frames"]) if meta.get("flash") else frame(name, i)


class Cover:
    def __init__(self, size, centre, ring):
        self.size, self.u, self.ring = size, min(size), ring
        self.cx, self.cy = centre[0] * size[0], centre[1] * size[1]
        self.page = Image.new("RGBA", size)

    def at(self, dx, dy):
        return round(self.cx + dx * self.u), round(self.cy + dy * self.u)

    def px(self, v):
        return max(1, round(v * self.u / 1080))

    def place(self, im, dx, dy, h, shadow=True, shadow_w=0.42):
        im = im.crop(im.getbbox())
        k = h * self.u / im.height
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        x, y = self.at(dx, dy)
        if shadow:
            # one hard cel shadow on the ground under the sprite
            d = ImageDraw.Draw(self.page)
            sw, sh = im.width * shadow_w, im.height * 0.07
            by = y + im.height * 0.46
            d.ellipse((x - sw, by - sh, x + sw, by + sh), fill=(10, 14, 28, 120))
        self.page.alpha_composite(im, (x - im.width // 2, y - im.height // 2))

    def glow(self, draw, radius):
        layer = Image.new("RGBA", self.size)
        draw(ImageDraw.Draw(layer))
        self.page.alpha_composite(layer.filter(ImageFilter.GaussianBlur(self.px(radius))))

    def burst(self, dx, dy, r, colour=(255, 255, 225, 255)):
        cx, cy = self.at(dx, dy)
        r = self.px(r)
        rnd = random.Random(int(dx * 1000 + dy * 77))
        rot = rnd.uniform(0, math.pi)
        pts = [(cx + math.cos(rot + k * math.pi / 6) * (r if k % 2 else r * 0.45),
                cy + math.sin(rot + k * math.pi / 6) * (r if k % 2 else r * 0.45)) for k in range(12)]
        self.glow(lambda d: d.ellipse((cx - r * 1.3, cy - r * 1.3, cx + r * 1.3, cy + r * 1.3), fill=(220, 255, 120, 200)), 18)
        ImageDraw.Draw(self.page).polygon(pts, fill=colour, outline=INK, width=self.px(6))

    def bolt(self, dx, dy, ang, length=60, width=20):
        """A glowing yellow-green energy bolt heading along ang, with a short trail."""
        x, y = self.at(dx, dy)
        L, W = self.px(length), self.px(width)
        ux, uy = math.cos(ang), math.sin(ang)
        tail = (x - ux * L * 2.6, y - uy * L * 2.6)
        self.glow(lambda d: d.line((tail, (x, y)), fill=(190, 255, 60, 170), width=W * 2), 10)
        d = ImageDraw.Draw(self.page)
        d.line((tail, (x - ux * L, y - uy * L)), fill=(235, 255, 160, 150), width=max(2, W // 3))
        head = (x + ux * L * 0.5, y + uy * L * 0.5)
        back = (x - ux * L * 0.7, y - uy * L * 0.7)
        d.line((back, head), fill=INK, width=W + self.px(10))
        for p in (back, head):
            r = (W + self.px(10)) / 2
            d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=INK)
        d.line((back, head), fill=BOLT, width=W)
        for p in (back, head):
            d.ellipse((p[0] - W / 2, p[1] - W / 2, p[0] + W / 2, p[1] + W / 2), fill=BOLT)
        d.line((back, head), fill=(255, 255, 235, 255), width=max(2, W // 3))

    def gem(self, dx, dy, s=26):
        x, y = self.at(dx, dy)
        s = self.px(s)
        pts = [(x, y - s), (x + s * 0.62, y), (x, y + s), (x - s * 0.62, y)]
        d = ImageDraw.Draw(self.page)
        d.polygon(pts, fill=GEM, outline=INK, width=self.px(5))
        d.polygon([(x, y - s * 0.6), (x + s * 0.25, y - s * 0.1), (x, y), (x - s * 0.25, y - s * 0.1)], fill=(255, 215, 245, 255))

    def number(self, dx, dy, text, size, fill=(255, 150, 40, 255)):
        x, y = self.at(dx, dy)
        f = ImageFont.truetype(FONT, self.px(size))
        m = self.px(size * 0.7)
        x, y = min(max(x, m * 1.5), self.size[0] - m * 1.5), min(max(y, m), self.size[1] - m)
        ImageDraw.Draw(self.page).text((x, y), text, font=f, fill=fill, anchor="mm",
                                       stroke_width=self.px(size * 0.12), stroke_fill=INK)


def ground(c, rnd):
    tile = Image.open(GAME / "ground" / "grass.png").convert("RGBA")
    k = c.u / 1080 * 1.4
    tile = tile.resize((round(tile.width * k), round(tile.height * k)), Image.LANCZOS)
    for x in range(0, c.size[0], tile.width):
        for y in range(0, c.size[1], tile.height):
            c.page.alpha_composite(tile, (x, y))
    deco = Image.open(GAME / "ground" / "deco.png").convert("RGBA")
    meta = json.loads((GAME / "ground" / "deco.json").read_text())
    return deco, meta


def deco_pieces(deco):
    """The deco sheet's props by name, from its atlas."""
    meta = json.loads((GAME / "ground" / "deco.json").read_text())
    return {f["name"]: deco.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"])) for f in meta["frames"]}


def draw(size, centre, corgi_h, ring, count, seed=5, mob_h=0.17, keep_out=None):
    c = Cover(size, centre, ring)
    rnd = random.Random(seed)
    deco, _ = ground(c, rnd)
    props = deco_pieces(deco)
    w, h = size[0] / c.u, size[1] / c.u
    for _ in range(int(w * h * 3)):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        dx, dy = x - c.cx / c.u, y - c.cy / c.u
        if math.hypot(dx / ring[0], dy / ring[1]) < 0.55:
            continue
        c.place(props[rnd.choice(["grass_tuft", "bush", "rocks", "stump"])], dx, dy, rnd.uniform(0.07, 0.11), shadow=False)

    # the plasma field burning on the ground around the corgi (gold, the hero's warm colour)
    box = (*c.at(-0.36, -0.04), *c.at(0.36, 0.28))
    c.glow(lambda d: d.ellipse(box, fill=(255, 170, 50, 70), outline=(255, 160, 40, 255), width=c.px(36)), 16)
    ImageDraw.Draw(c.page).ellipse(box, outline=(255, 200, 80, 255), width=c.px(12))

    # XP gems left by bugs already down, thicker towards the ring
    for _ in range(int(count * 1.3)):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.45, 1.05)
        c.gem(ring[0] * r * math.cos(a), ring[1] * r * math.sin(a) + 0.08, rnd.uniform(18, 26))

    # the ring of bugs, back to front; every fifth front-rank bug is mid-hit
    mobs = []
    for k in range(count):
        a = k / count * 2 * math.pi + rnd.uniform(-0.05, 0.05)
        r = rnd.uniform(1.0, 1.5)
        dx, dy = ring[0] * r * math.cos(a), ring[1] * r * math.sin(a)
        x, y = c.cx / c.u + dx, c.cy / c.u + dy
        if -0.08 < x < w + 0.08 and -0.02 < y < h + 0.12:
            mobs.append((dy, dx, a, r, MOBS[k % len(MOBS)], rnd.randrange(10)))
    front = sorted((m for m in mobs if m[3] < 1.18), key=lambda m: m[2])
    hit = set(id(m) for m in front[::3])
    for m in sorted(mobs, key=lambda m: m[0]):
        dy, dx, a, r, name, i = m
        hgt = mob_h + mob_h * 0.3 * max(-0.5, min(0.5, dy))
        if id(m) in hit:
            c.place(frame(name, i).rotate(rnd.uniform(-18, 18), expand=True, resample=Image.BICUBIC), dx, dy, hgt)
        else:
            c.place(frame(name, i), dx, dy, hgt)

    # bolts fanning out from both guns towards the ring; bursts and numbers on the hit bugs
    gun_l, gun_r = (-0.42 * corgi_h, 0.02), (0.42 * corgi_h, 0.02)
    for m in front:
        if id(m) not in hit:
            continue
        dy, dx, a, r, *_ = m
        ang = math.atan2(dy - 0.02, dx)
        gx, gy = math.cos(ang) * 0.26 * corgi_h / 0.4, 0.02 + math.sin(ang) * 0.2 * corgi_h / 0.4
        for t in (0.3, 0.66):
            c.bolt(gx + (dx - gx) * t, gy + (dy - gy) * t, ang)
        bx, by = dx - math.cos(ang) * 0.04, dy - math.sin(ang) * 0.04
        c.burst(bx, by, 60)
        for k in range(7):
            sa = ang + math.pi + rnd.uniform(-1.3, 1.3)
            sr = rnd.uniform(0.07, 0.13)
            c.gem(bx + math.cos(sa) * sr * 0.3, by + math.sin(sa) * sr * 0.3, 7) if k == 0 else None
            x0, y0 = c.at(bx + math.cos(sa) * 0.05, by + math.sin(sa) * 0.05)
            x1, y1 = c.at(bx + math.cos(sa) * sr, by + math.sin(sa) * sr)
            ImageDraw.Draw(c.page).line((x0, y0, x1, y1), fill=(240, 255, 170, 255), width=c.px(7))
        crit = rnd.random() < 0.4
        if keep_out and keep_out(c.at(dx, dy - 0.15)):
            continue
        c.number(dx + rnd.uniform(-0.05, 0.05), dy - 0.15, str(rnd.randrange(40, 99) * (3 if crit else 1)),
                 96 if crit else 66, (255, 150, 40, 255) if crit else (255, 255, 255, 255))

    hero = cutout(str(CORGI / "portrait.png"))
    c.place(hero, 0, 0, corgi_h, shadow_w=0.3)
    return grade(c)


def grade(c):
    w, h = c.size
    im = ImageEnhance.Color(c.page.convert("RGB")).enhance(1.0)
    edge = ImageEnhance.Brightness(ImageEnhance.Color(im).enhance(0.7)).enhance(0.55)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot((xx - c.cx) / (w * 0.575), (yy - c.cy) / (h * 0.65))
    mask = Image.fromarray((np.clip(d, 0, 1) * 255).astype(np.uint8), "L")
    mask = ImageChops.multiply(mask, mask)
    return Image.composite(edge, im, mask)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, layout in LAYOUTS.items():
        draw(*layout).save(out / f"collage_{name}.png", optimize=True)
        print(out / f"collage_{name}.png")


if __name__ == "__main__":
    main()
