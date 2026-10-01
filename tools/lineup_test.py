"""Style consistency check for a batch of mobs: a big lineup, per-sprite numbers, and a crowd
at phone size on the grass tile (mobs scaled to the opaque area of the first mob at 80 tall).
usage: python lineup_test.py <out prefix> <hero> <mob>... [--elite <img>]
Writes <prefix>_lineup.png, <prefix>_crowd.png and prints one line of numbers per sprite:
  outline  dark border width as a share of the sprite height (thick sticker outline ~ 1.2-2 %)
  fill     opaque share of the bounding box (how heavy the silhouette reads)
  sat      mean saturation of the coloured (non-outline) pixels
  warm     share of coloured pixels that are saturated warm hues (red eyes excepted, kept < 3 %)
  luma     mean lightness of the coloured pixels (mobs should sit in one band)"""
import colorsys
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from cutout import cutout  # noqa: E402

GRASS = Path(__file__).parent.parent / "art/monk/ground/tile_grass.png"
LINEUP_H = 300
# phone scale: logical sizes (hero 120, mob 80, elite 130) at about 0.72 px per unit
PHONE = 0.72


def fit(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def stats(im):
    """Numbers from a sprite normalised to 400 px high."""
    im = fit(im, 400)
    a = im.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    mask = np.asarray(a) > 0
    inner = np.asarray(a.filter(ImageFilter.MinFilter(9))) > 0  # 4 px in from the border
    # outline width ~ dark pixels hugging the border / border length, measured on an 8 px deep band
    deep = mask & ~(np.asarray(a.filter(ImageFilter.MinFilter(17))) > 0)
    edge = mask & ~(np.asarray(a.filter(ImageFilter.MinFilter(3))) > 0)
    px = np.asarray(im).astype(np.float32) / 255
    rgb = px[..., :3]
    dark = rgb.mean(axis=2) < 70 / 255
    outline = (dark & deep).sum() / max(1, edge.sum()) / 400
    fill = mask.mean()
    colour = inner & (px[..., 3] > 200 / 255) & ~dark
    c = rgb[colour]
    hi, lo = c.max(axis=1), c.min(axis=1)
    light = (hi + lo) / 2
    sat = np.where(hi == lo, 0, (hi - lo) / np.maximum(1e-6, 1 - np.abs(hi + lo - 1)))
    step = max(1, len(c) // 20000)
    hue = np.array([colorsys.rgb_to_hsv(*v)[0] for v in c[::step]])
    hot = (sat[::step] > 0.45) & (light[::step] > 0.25) & ((hue < 0.14) | (hue > 0.95))
    warm = hot.mean() if len(hot) else 0.0
    return outline, fill, sat.mean(), warm, light.mean()


def area(im):
    return max(1, int((np.asarray(im.getchannel("A")) > 128).sum()))


def lineup(names, ims, dst):
    sprites = [fit(im, LINEUP_H) for im in ims]
    gap = 30
    w = sum(s.width for s in sprites) + gap * (len(sprites) + 1)
    out = Image.new("RGBA", (w, LINEUP_H + 90), (255, 255, 255, 255))
    d = ImageDraw.Draw(out)
    font = ImageFont.load_default(size=22)
    x = gap
    for name, s in zip(names, sprites):
        out.alpha_composite(s, (x, 20))
        d.text((x + s.width // 2, LINEUP_H + 45), name, fill=(0, 0, 0), font=font, anchor="mm")
        x += s.width + gap
    out.convert("RGB").save(dst)


def crowd(hero, mobs, elite, dst, w=540, h=600):
    tile = Image.open(GRASS).convert("RGBA")
    scene = Image.new("RGBA", (w, h))
    for ty in range(0, h, tile.height):
        for tx in range(0, w, tile.width):
            scene.paste(tile, (tx, ty))
    hero_s = fit(hero, round(120 * PHONE))
    # same opaque area as the first mob at 80 tall, so wide shapes do not read heavier
    target = area(fit(mobs[0], round(80 * PHONE)))
    mob_s = [fit(m, round(80 * PHONE * (target / area(fit(m, round(80 * PHONE)))) ** 0.5)) for m in mobs]
    rng = random.Random(3)
    sprites = []
    cx, cy = w // 2, h // 2
    for i in range(70):
        x, y = rng.randint(0, w - 60), rng.randint(0, h - 60)
        if abs(x + 28 - cx) < 70 and abs(y + 28 - cy) < 80:
            continue
        m = mob_s[i % len(mob_s)]
        sprites.append((y + m.height, m, x, y))
    if elite is not None:
        e = fit(elite, round(130 * PHONE))
        sprites.append((140 + e.height, e, w - 160, 140))
    sprites.append((cy - 40 + hero_s.height, hero_s, cx - hero_s.width // 2, cy - 40))
    shadow = Image.new("RGBA", (60, 18))
    ImageDraw.Draw(shadow).ellipse((0, 0, 59, 17), fill=(0, 0, 0, 90))
    for foot, im, x, y in sorted(sprites, key=lambda s: s[0]):
        scene.alpha_composite(shadow.resize((im.width, 14)), (x, foot - 8))
        scene.alpha_composite(im, (x, y))
    scene.convert("RGB").save(dst)


def main():
    args = sys.argv[1:]
    elite_src = None
    if "--elite" in args:
        i = args.index("--elite")
        elite_src = args[i + 1]
        del args[i:i + 2]
    prefix, hero_src, mob_srcs = args[0], args[1], args[2:]
    srcs = [hero_src] + mob_srcs + ([elite_src] if elite_src else [])
    ims = [cutout(s) for s in srcs]
    names = [Path(s).stem.replace("enemy_", "").replace("mob_", "") for s in srcs]
    print(f"{'sprite':<20}outline  fill   sat   warm  luma")
    for n, im in zip(names, ims):
        o, f, s, wm, l = stats(im)
        print(f"{n:<20}{o * 100:5.2f}%  {f:.2f}  {s:.2f}  {wm * 100:4.1f}%  {l:.2f}")
    lineup(names, ims, f"{prefix}_lineup.png")
    crowd(ims[0], ims[1:1 + len(mob_srcs)], ims[-1] if elite_src else None, f"{prefix}_crowd.png")


if __name__ == "__main__":
    main()
