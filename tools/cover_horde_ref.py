"""Builds the horde covers: the gameplay read (one monk in the middle of a ring of monsters, a few
spells going off around him) as a collage of the game's own sprites, at each store cover's shape.
Few kinds and few spells, drawn big, so the picture still reads at thumbnail size. Repaints by
edit_image simplified the ring into two facing groups, so this collage, with a vignette and a grade
to pull it together, is the cover itself.
usage: python cover_horde_ref.py <store dir>
  (writes cover_horde_{landscape,portrait,square}.png at 1920x1080, 1080x1620 and 800x800, no logo;
  cover_final.py then cuts them to the store sizes and lays the logo on the landscape one)"""
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from cover_ref import ART, drop_shadow  # noqa: E402
from cutout import cutout  # noqa: E402

ROOT = Path(__file__).parent.parent
PUBLIC = ROOT / "client" / "public" / "art"
MOBS = ["mobs/jiangshi", "mobs/fox", "ch4/mobs/lantern", "ch3/mobs/skeleton"]
GOLD = (255, 200, 60, 255)
INK = (20, 16, 12, 255)

# Lengths are in u, the cover's short side; offsets are from the monk. The monster ring is an
# ellipse of radii (rx, ry) in u; the cymbals and the monsters they knock flying sit on it, in
# fractions of those radii, so they follow the ring from shape to shape.
# name: size, monk centre (fractions of the cover), monk height, ring radii, monsters on the ring
LAYOUTS = {
    "landscape": ((1920, 1080), (0.5, 0.55), 0.48, (0.587, 0.40), 40),
    "portrait": ((1080, 1620), (0.5, 0.55), 0.56, (0.36, 0.60), 44),
    "square": ((800, 800), (0.5, 0.55), 0.48, (0.42, 0.40), 38),
}
CYMBALS = [(0.727, -0.675), (0.818, 0.30), (0.303, -1.08), (0.363, 1.03)]
FLYERS = [("mobs/jiangshi", 1.0, -0.675, -35), ("ch4/mobs/lantern", 1.09, 0.405, 30)]


def frame(name, i=0):
    """Frame i of a baked mob sequence, cropped to its pixels."""
    meta = json.loads((PUBLIC / f"{name}.json").read_text())
    sheet = Image.open(PUBLIC / f"{name}.png").convert("RGBA")
    w, h, cols = meta["frameW"], meta["frameH"], meta["cols"]
    im = sheet.crop((i % cols * w, i // cols * h, i % cols * w + w, i // cols * h + h))
    return im.crop(im.getbbox())


class Cover:
    """One cover being drawn: the page, its unit u in pixels and the monk's centre."""

    def __init__(self, size, monk, ring):
        self.size, self.u, self.ring = size, min(size), ring
        self.mx, self.my = monk[0] * size[0], monk[1] * size[1]
        self.page = Image.new("RGBA", size)

    def at(self, dx, dy):
        """The pixel at an offset from the monk, in u."""
        return round(self.mx + dx * self.u), round(self.my + dy * self.u)

    def on_ring(self, fx, fy):
        return fx * self.ring[0], fy * self.ring[1]

    def px(self, v):
        """A length tuned on the first 816-high landscape canvas, at this cover's scale."""
        return max(1, round(v * self.u / 816))

    def place(self, im, dx, dy, h):
        """Pastes im centred at an offset from the monk, h u tall."""
        im = im.crop(im.getbbox())
        k = h * self.u / im.height
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        x, y = self.at(dx, dy)
        self.page.alpha_composite(im, (x - im.width // 2, y - im.height // 2))

    def glow(self, draw, radius):
        """Draws onto a layer with draw(ImageDraw), blurs it into a glow and composites it."""
        layer = Image.new("RGBA", self.size)
        draw(ImageDraw.Draw(layer))
        self.page.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius * self.u / 816)))

    def burst(self, dx, dy, r):
        """A white impact star with an ink outline where a spell hits."""
        cx, cy = self.at(dx, dy)
        r = self.px(r)
        pts = [(cx + math.cos(k * math.pi / 5) * (r if k % 2 else r * 0.45),
                cy + math.sin(k * math.pi / 5) * (r if k % 2 else r * 0.45)) for k in range(10)]
        ImageDraw.Draw(self.page).polygon(pts, fill=(255, 255, 230, 255), outline=INK, width=self.px(5))

    def bolt(self, points):
        """A vajra bolt chaining through monsters: a jagged white-blue line with an ink edge and a glow."""
        rnd = random.Random(3)
        path = []
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            for t in range(5):
                path.append(self.at(x0 + (x1 - x0) * t / 5 + rnd.uniform(-0.018, 0.018),
                                    y0 + (y1 - y0) * t / 5 + rnd.uniform(-0.03, 0.03)))
        path.append(self.at(*points[-1]))
        self.glow(lambda d: d.line(path, fill=(110, 200, 255, 255), width=self.px(44), joint="curve"), 14)
        d = ImageDraw.Draw(self.page)
        d.line(path, fill=INK, width=self.px(22), joint="curve")
        d.line(path, fill=(150, 225, 255, 255), width=self.px(14), joint="curve")
        d.line(path, fill=(255, 255, 255, 255), width=self.px(6), joint="curve")
        for p in points[1:]:
            self.burst(*p, 30)

    def cymbal(self, dx, dy, r):
        """A cymbal flying out from the monk: a thick-outlined gold disc at an angle, speed lines behind it."""
        d = ImageDraw.Draw(self.page)
        r = self.px(r)
        cx, cy = self.at(dx, dy)
        n = math.hypot(dx, dy)
        ux, uy = -dx / n, -dy / n
        for off in (-0.5, 0, 0.5):
            sx, sy = cx - uy * r * off, cy + ux * r * off
            d.line((sx, sy, sx + ux * r * 3.2, sy + uy * r * 3.2), fill=(255, 255, 255, 230), width=self.px(8))
        d.ellipse((cx - r, cy - r * 0.6, cx + r, cy + r * 0.6), fill=GOLD, outline=INK, width=self.px(7))
        d.ellipse((cx - r * 0.75, cy - r * 0.45, cx + r * 0.75, cy + r * 0.45), outline=(215, 150, 30, 255), width=self.px(4))
        d.ellipse((cx - r * 0.28, cy - r * 0.17, cx + r * 0.28, cy + r * 0.17), fill=(205, 140, 30, 255), outline=INK, width=self.px(4))
        d.arc((cx - r * 0.7, cy - r * 0.45, cx + r * 0.3, cy + r * 0.2), 200, 260, fill=(255, 250, 210, 255), width=self.px(6))


def draw(size, monk, monk_h, ring, count):
    c = Cover(size, monk, ring)
    rnd = random.Random(11)
    tile = Image.open(ROOT / "art" / "monk" / "ground" / "tile_grass.png").convert("RGBA")
    tile = tile.resize((c.px(tile.width), c.px(tile.height)), Image.LANCZOS)
    for x in range(0, size[0], tile.width):
        for y in range(0, size[1], tile.height):
            c.page.alpha_composite(tile, (x, y))

    # the incense ring burning on the ground around the monk
    box = (*c.at(-0.41, -0.03), *c.at(0.41, 0.31))
    c.glow(lambda d: d.ellipse(box, outline=(255, 140, 40, 255), width=c.px(40)), 16)
    ImageDraw.Draw(c.page).ellipse(box, outline=(255, 175, 60, 255), width=c.px(14))

    # a ring of monsters, back to front, bigger and fewer than in the game so each one reads
    w, h = size[0] / c.u, size[1] / c.u
    mobs = []
    for k in range(count):
        a = k / count * 2 * math.pi + rnd.uniform(-0.06, 0.06)
        r = rnd.uniform(1.0, 1.45)
        dx, dy = ring[0] * r * math.cos(a), ring[1] * r * math.sin(a)
        x, y = c.mx / c.u + dx, c.my / c.u + dy
        if -0.06 < x < w + 0.06 and 0.06 < y < h + 0.12:
            mobs.append((dy, dx, MOBS[k % len(MOBS)], rnd.randrange(6)))
    for dy, dx, name, i in sorted(mobs):
        c.place(frame(name, i), dx, dy, 0.194 + 0.08 * dy)

    # the bolt chains through four monsters on the left, from the monk outward
    left = sorted([(dx, dy - 0.065) for dy, dx, _, _ in mobs
                   if dx < -0.51 * ring[0] and -0.95 * ring[1] < dy < 0.68 * ring[1]], key=lambda p: p[1])
    c.bolt([(-0.142, -0.14)] + left[::max(1, len(left) // 4)][:4])

    # cymbals flying out on the right, two monsters knocked into the air by them
    for name, fx, fy, rot in FLYERS:
        dx, dy = c.on_ring(fx, fy)
        c.burst(dx, dy + 0.02, 55)
        c.place(frame(name).rotate(rot, expand=True, resample=Image.BICUBIC), dx, dy, 0.17)
    for fx, fy in CYMBALS:
        c.cymbal(*c.on_ring(fx, fy), 48)

    c.place(drop_shadow(cutout(str(ART / "hero_kick_v1.png"))), 0, 0, monk_h)
    c.place(Image.open(PUBLIC / "cuju.png").convert("RGBA"), 0.293 * monk_h / 0.48, -0.162 * monk_h / 0.48, 0.09)
    return grade(c)


def grade(c):
    """Pulls the collage together: a slight overall saturation drop, and a vignette that darkens and
    desaturates the crowd at the edges so the eye lands on the monk."""
    w, h = c.size
    im = ImageEnhance.Color(c.page.convert("RGB")).enhance(0.92)
    edge = ImageEnhance.Brightness(ImageEnhance.Color(im).enhance(0.6)).enhance(0.45)
    mask = Image.radial_gradient("L").resize((round(w * 1.1), round(h * 1.3)), Image.BICUBIC)
    mx, my = round(c.mx), round(c.my)
    mask = mask.crop((mask.width // 2 - mx, mask.height // 2 - my, mask.width // 2 - mx + w, mask.height // 2 - my + h))
    mask = ImageChops.multiply(mask, mask)  # keep the middle untouched, fall off towards the corners
    return Image.composite(edge, im, mask)


def main():
    out = Path(sys.argv[1])
    for name, layout in LAYOUTS.items():
        draw(*layout).save(out / f"cover_horde_{name}.png", optimize=True)
        print(out / f"cover_horde_{name}.png", layout[0])


if __name__ == "__main__":
    main()
