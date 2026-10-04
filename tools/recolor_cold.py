"""Turn warm art cold: the hero's atlas into the Inner Demon's (chapter 5's last boss).

Every warm pixel (hue within WARM of orange: the saffron robe, the skin, the gold, the brown
beads, the blush) is turned round the colour wheel by --turn degrees; the pale ones (skin) lose
most of their saturation so the face reads blue-grey rather than lilac. Every pixel is darkened
by --dark; cold pixels (the tear drop) and the black outline keep their hue. Alpha is untouched,
so the atlas still fits its skeleton.json.

    python tools/recolor_cold.py client/public/art/hero/atlas.png client/public/art/ch5/demon/atlas.png
"""

import argparse

import numpy as np
from PIL import Image


def to_hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h *= 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def to_rgb(h: np.ndarray, s: np.ndarray, v: np.ndarray) -> np.ndarray:
    c = v * s
    hp = (h % 360) / 60
    x = c * (1 - np.abs(hp % 2 - 1))
    z = np.zeros_like(h)
    out = np.zeros(h.shape + (3,))
    for lo, (a, b, cc) in enumerate([(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]):
        sel = (hp >= lo) & (hp < lo + 1)
        out[sel] = np.stack([a[sel], b[sel], cc[sel]], -1)
    return out + (v - c)[..., None]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--turn', type=float, default=235, help='degrees to turn warm hues (orange to violet)')
    ap.add_argument('--warm', type=float, default=55, help='hues within this of 25 degrees count as warm')
    ap.add_argument('--dark', type=float, default=0.72, help='value multiplier for every pixel')
    ap.add_argument('--pale', type=float, default=0.45, help='below this saturation a warm pixel is skin: kept greyish')
    args = ap.parse_args()

    img = Image.open(args.src).convert('RGBA')
    a = np.asarray(img).astype(np.float64) / 255
    h, s, v = to_hsv(a[..., :3])
    off = np.abs(((h - 25) + 180) % 360 - 180)
    warm = (off <= args.warm) & (s > 0.08)
    h = np.where(warm, h + args.turn, h)
    skin = warm & (s < args.pale)
    s = np.where(skin, s * 0.55, np.where(warm, s * 0.8, s))
    v = v * args.dark
    rgb = to_rgb(h, s, v)
    out = np.concatenate([rgb, a[..., 3:]], -1)
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(args.dst, optimize=True)
    print(f'{args.dst}: {int(warm.sum())} warm pixels turned')


if __name__ == '__main__':
    main()
