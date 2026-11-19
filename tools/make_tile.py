"""Turns the inner part of a generated ground picture into a seamless tile and pulls it
toward a target brightness / saturation, so the ground stays behind the characters.
usage: python make_tile.py <in> <out.png> <x0,y0,x1,y1> [--size 512] [--value 0.32]
                           [--sat 0.35] [--hue-shift 0] [--contrast 0.6] [--highlight 1]
                           [--sat-spread 1] [--quad]
Seamless: the crop is blended with a copy shifted by half its size through a mask that is
opaque in the middle and clear at the edges, which hides the wrap-around seam. That leaves a
break where the edges' midpoints meet the shifted copy's own seam, which grass and snow hide but
big stone plates show as straight lines; --quad blends four copies instead (as is, shifted
across, shifted down, shifted both), each only where it has no seam, through narrow soft bands.
A box of `whole` regrades a tile that is already seamless as it is: no crop, no seam blend."""
import argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("box")
ap.add_argument("--size", type=int, default=512)
ap.add_argument("--value", type=float, default=0.32, help="target mean brightness 0..1")
ap.add_argument("--sat", type=float, default=0.35, help="saturation multiplier")
ap.add_argument("--hue-shift", type=float, default=0.0, help="degrees")
ap.add_argument("--contrast", type=float, default=0.6, help="brightness spread multiplier")
ap.add_argument("--highlight", type=float, default=1.0,
                help="extra multiplier on the spread above the mean (tames white flowers and specks)")
ap.add_argument("--sat-spread", type=float, default=1.0,
                help="pulls each pixel's saturation toward the mean (greys flowers into the grass)")
ap.add_argument("--quad", action="store_true", help="four-copy seam blend (no straight lines)")
ap.add_argument("--colors", type=int, default=128, help="palette size of the saved PNG")
a = ap.parse_args()

whole = a.box == "whole"
im = Image.open(a.src).convert("RGB")
if not whole:
    im = im.crop(tuple(int(v) for v in a.box.split(",")))
im = im.resize((a.size, a.size), Image.LANCZOS)
px = np.asarray(im, dtype=np.float32) / 255

# seam hiding: weight w is 1 in the centre, 0 at the borders
n = a.size
t = np.abs(np.linspace(-1, 1, n))
w1 = np.clip((1 - t) * 2.5, 0, 1)
w = np.minimum.outer(w1, w1)[..., None]
if not whole and a.quad:
    # f is 1 in the middle half and 0 at the edges, turning over soft bands round the quarters
    q = np.clip((0.5 - t) / 0.16 + 0.5, 0, 1)
    f = q * q * (3 - 2 * q)
    fy, fx = f[:, None, None], f[None, :, None]
    h = n // 2
    across = np.roll(px, h, axis=1)
    down = np.roll(px, h, axis=0)
    both = np.roll(px, (h, h), axis=(0, 1))
    px = px * fx * fy + across * (1 - fx) * fy + down * fx * (1 - fy) + both * (1 - fx) * (1 - fy)
elif not whole:
    shifted = np.roll(px, (n // 2, n // 2), axis=(0, 1))
    px = px * w + shifted * (1 - w)

# colour grading in HSV (PIL works in 0..255)
rgb8 = Image.fromarray((px * 255).round().astype(np.uint8))
hsv = np.asarray(rgb8.convert("HSV"), dtype=np.float32) / 255
hsv[..., 0] = (hsv[..., 0] + a.hue_shift / 360) % 1
sat = hsv[..., 1]
hsv[..., 1] = np.clip((sat.mean() + (sat - sat.mean()) * a.sat_spread) * a.sat, 0, 1)
v = hsv[..., 2]
d = (v - v.mean()) * a.contrast
hsv[..., 2] = np.clip(a.value + np.where(d > 0, d * a.highlight, d), 0, 1)
out = Image.fromarray((hsv * 255).round().astype(np.uint8), "HSV").convert("RGB")
rgb = np.asarray(out, dtype=np.float32) / 255
out.quantize(a.colors, method=Image.Quantize.MEDIANCUT).save(a.dst, optimize=True)
print(a.dst, "mean rgb", (rgb.reshape(-1, 3).mean(0) * 255).round())
