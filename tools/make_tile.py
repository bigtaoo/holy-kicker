"""Turns the inner part of a generated ground picture into a seamless tile and pulls it
toward a target brightness / saturation, so the ground stays behind the characters.
usage: python make_tile.py <in> <out.png> <x0,y0,x1,y1> [--size 512] [--value 0.32]
                           [--sat 0.35] [--hue-shift 0] [--contrast 0.6]
Seamless: the crop is blended with a copy shifted by half its size through a mask that is
opaque in the middle and clear at the edges, which hides the wrap-around seam."""
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
ap.add_argument("--colors", type=int, default=128, help="palette size of the saved PNG")
a = ap.parse_args()

box = tuple(int(v) for v in a.box.split(","))
im = Image.open(a.src).convert("RGB").crop(box).resize((a.size, a.size), Image.LANCZOS)
px = np.asarray(im, dtype=np.float32) / 255

# seam hiding: weight w is 1 in the centre, 0 at the borders
n = a.size
t = np.abs(np.linspace(-1, 1, n))
w1 = np.clip((1 - t) * 2.5, 0, 1)
w = np.minimum.outer(w1, w1)[..., None]
shifted = np.roll(px, (n // 2, n // 2), axis=(0, 1))
px = px * w + shifted * (1 - w)

# colour grading in HSV (PIL works in 0..255)
rgb8 = Image.fromarray((px * 255).round().astype(np.uint8))
hsv = np.asarray(rgb8.convert("HSV"), dtype=np.float32) / 255
hsv[..., 0] = (hsv[..., 0] + a.hue_shift / 360) % 1
hsv[..., 1] = np.clip(hsv[..., 1] * a.sat, 0, 1)
v = hsv[..., 2]
hsv[..., 2] = np.clip(a.value + (v - v.mean()) * a.contrast, 0, 1)
out = Image.fromarray((hsv * 255).round().astype(np.uint8), "HSV").convert("RGB")
rgb = np.asarray(out, dtype=np.float32) / 255
out.quantize(a.colors, method=Image.Quantize.MEDIANCUT).save(a.dst, optimize=True)
print(a.dst, "mean rgb", (rgb.reshape(-1, 3).mean(0) * 255).round())
