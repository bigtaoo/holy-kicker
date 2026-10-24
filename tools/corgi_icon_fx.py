"""Finishing touches on two cut corgi icons (tools/corgi_art.py runs it after the split).
usage: python tools/corgi_icon_fx.py star <cut knives.png>          (in place)
       python tools/corgi_icon_fx.py repair <cut incense.png> <out>  (the evolved Repair Field)
star: the drawn shuriken's cream blades become glowing cyan plasma with a white core, and four
cyan lights sit on its orange hub. repair: the plasma field's teal turns medic green and a white
cross badge goes on top right, so the evolved card reads apart from the base one."""
import colorsys
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

CYAN, DEEP, CORE = (0x6f, 0xe4, 0xff), (0x34, 0xb4, 0xdc), (0xf0, 0xff, 0xff)
OUTLINE = (0x1e, 0x22, 0x28)
GLOW_PAD = 30


def blades(im):
    """The cream blade pixels: big cream regions only, so highlights elsewhere stay."""
    r, g, b, a = (im[..., i] for i in range(4))
    cream = ndimage.binary_opening((r > 170) & (g > 170) & (b > 120) & (r - b > 10) & (a > 200))
    lab, n = ndimage.label(cream)
    sizes = ndimage.sum(cream, lab, range(1, n + 1))
    return np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 400])


def star(path):
    im = np.array(Image.open(path).convert("RGBA")).astype(float)
    cream = blades(im)
    dist = ndimage.distance_transform_edt(cream)
    # the white core runs where a blade is thickest for its own width
    core = cream & (dist > ndimage.maximum_filter(dist, size=25) * 0.78) & (dist > 3)
    shade = cream & (im[..., :3].mean(axis=2) < 222)
    im[cream, :3] = CYAN
    im[shade & ~core, :3] = DEEP
    im[core, :3] = CORE
    pic = Image.fromarray(im.astype(np.uint8))
    # a soft cyan glow behind the blades
    out = Image.new("RGBA", (pic.width + GLOW_PAD * 2, pic.height + GLOW_PAD * 2))
    halo = Image.new("L", out.size)
    halo.paste(Image.fromarray((cream * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(31)), (GLOW_PAD, GLOW_PAD))
    glow = Image.new("RGBA", out.size, CYAN + (0,))
    glow.putalpha(halo.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * 0.95)))
    out.alpha_composite(glow)
    out.alpha_composite(pic, (GLOW_PAD, GLOW_PAD))
    # four lights on the orange hub, between the blades
    arr = np.array(out).astype(int)
    hub = (arr[..., 0] > 200) & (arr[..., 1] > 90) & (arr[..., 1] < 170) & (arr[..., 2] < 80)
    ys, xs = np.nonzero(hub)
    cy, cx = ys.mean(), xs.mean()
    rr = float(np.median(np.hypot(ys - cy, xs - cx)))
    d = ImageDraw.Draw(out)
    s = rr * 0.13
    for k in range(4):
        x, y = cx + math.cos(k * math.pi / 2) * rr, cy + math.sin(k * math.pi / 2) * rr
        d.ellipse((x - s - 2, y - s - 2, x + s + 2, y + s + 2), fill=OUTLINE + (255,))
        d.ellipse((x - s, y - s, x + s, y + s), fill=CYAN + (255,))
        d.ellipse((x - s * .45, y - s * .45, x + s * .45, y + s * .45), fill=CORE + (255,))
    out.save(path)


def repair(src, dst):
    im = Image.open(src).convert("RGBA")
    arr = np.array(im).astype(float) / 255
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in arr[..., :3].reshape(-1, 3)]).reshape(arr.shape[:2] + (3,))
    # the field's teal (hue about 166 degrees) turns medic green (about 130)
    teal = (hsv[..., 0] > 0.40) & (hsv[..., 0] < 0.56) & (arr[..., 3] > 0)
    hsv[teal, 0] = 0.36
    rgb = np.array([colorsys.hsv_to_rgb(*p) for p in hsv.reshape(-1, 3)]).reshape(arr.shape[:2] + (3,))
    arr[..., :3] = rgb
    out = Image.fromarray((arr * 255).round().astype(np.uint8))
    # a white cross with the sticker outline, top right
    w = out.width
    cx, cy, arm, bar = w * 0.82, w * 0.17, w * 0.15, w * 0.055
    d = ImageDraw.Draw(out)
    for grow, fill in ((w * 0.025, OUTLINE), (0, (255, 255, 255))):
        d.rounded_rectangle((cx - bar - grow, cy - arm - grow, cx + bar + grow, cy + arm + grow), bar * .4 + grow, fill=fill + (255,))
        d.rounded_rectangle((cx - arm - grow, cy - bar - grow, cx + arm + grow, cy + bar + grow), bar * .4 + grow, fill=fill + (255,))
    out.save(dst)


if __name__ == "__main__":
    if sys.argv[1] == "star":
        star(sys.argv[2])
    else:
        repair(sys.argv[2], sys.argv[3])
