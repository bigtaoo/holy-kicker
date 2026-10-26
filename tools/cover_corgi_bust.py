"""Variant B: the battlefield at game scale (small corgi in a ring of bugs) with a big corgi bust in
the lower left corner, the mobile-ad layout. usage: python tools/cover_corgi_bust.py <out dir>"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

import cover_corgi_horde as cc

# name: size, small corgi centre, small corgi height, ring, bugs, bust height (fraction of the
# cover's height), bust left edge (fraction of width)
LAYOUTS = {
    "landscape": ((1920, 1080), (0.64, 0.52), 0.24, (0.38, 0.29), 44, 0.66, 0.0),
    "portrait": ((1080, 1920), (0.5, 0.40), 0.26, (0.36, 0.32), 40, 0.36, -0.04),
}


def bust(page, h_frac, left):
    hero = cc.cutout(str(cc.CORGI / "portrait.png"))
    hero = hero.crop(hero.getbbox())
    hero = hero.crop((0, 0, hero.width, round(hero.height * 0.78)))  # head, chest and both guns
    k = page.height * h_frac / hero.height
    hero = hero.resize((round(hero.width * k), round(hero.height * k)), Image.LANCZOS)
    x, y = round(left * page.width), page.height - hero.height + round(hero.height * 0.04)
    # one hard cel shadow behind the bust, offset down and right
    shadow = Image.new("RGBA", hero.size, (8, 10, 24, 0))
    shadow.putalpha(hero.getchannel("A").point(lambda v: 150 if v > 128 else 0))
    page.alpha_composite(shadow, (x + round(page.height * 0.018), y + round(page.height * 0.018)))
    # a thick white sticker edge so the bust lifts off the battlefield
    edge = Image.new("RGBA", hero.size, (255, 255, 255, 0))
    edge.putalpha(hero.getchannel("A").filter(ImageFilter.MaxFilter(15)))
    page.alpha_composite(edge, (x, y))
    page.alpha_composite(hero, (x, y))


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, (size, centre, ch, ring, n, bh, left) in LAYOUTS.items():
        im = cc.draw(size, centre, ch, ring, n, seed=9, mob_h=0.12,
                     keep_out=lambda p: p[0] < size[0] * 0.42 and p[1] > size[1] * (1 - bh)).convert("RGBA")
        bust(im, bh, left)
        im.convert("RGB").save(out / f"collage_b_{name}.png", optimize=True)
        print(out / f"collage_b_{name}.png")


if __name__ == "__main__":
    main()
