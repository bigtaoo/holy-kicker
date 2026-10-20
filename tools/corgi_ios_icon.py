"""The corgi iOS app's placeholder icon (docs/ios.md "Second app: Corgi Commando"): the battle-cry
head from art/reskin/corgi/face_fire.png, cut out of its white paper, on the corgi's navy with a
yellow-green blaster glow behind it. 1024x1024 RGB (the App Store refuses alpha).
A stand-in until real icon art is drawn; it only has to be recognisable on TestFlight.
usage: python tools/corgi_ios_icon.py [out.png]"""
import sys
from PIL import Image, ImageDraw, ImageFilter

from cutout import background_mask

SRC = "art/reskin/corgi/face_fire.png"
OUT = "art/reskin/corgi/ios/AppIcon.png"
SIZE = 1024
# the head from the ear tips to the collar, inside the outstretched arms
HEAD = (262, 20, 922, 505)
NAVY_TOP, NAVY_BOTTOM = (38, 42, 72), (16, 18, 42)  # build/theme.mjs corgi colours
GLOW = (190, 230, 60)


def main(out=OUT):
    rgb = Image.open(SRC).convert("RGB")
    mask = background_mask(rgb)
    head = rgb.convert("RGBA")
    head.putalpha(mask.point(lambda v: 0 if v else 255).filter(ImageFilter.GaussianBlur(1)))
    head = head.crop(HEAD)

    icon = Image.new("RGB", (SIZE, SIZE))
    draw = ImageDraw.Draw(icon)
    for y in range(SIZE):
        t = y / (SIZE - 1)
        draw.line([(0, y), (SIZE, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOTTOM)))
    glow = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(glow).ellipse((170, 170, SIZE - 170, SIZE - 170), fill=110)
    icon.paste(GLOW, (0, 0), glow.filter(ImageFilter.GaussianBlur(120)))

    # the head fills the width and sits on the bottom edge, the collar cut off by it
    scale = SIZE * 0.98 / head.width
    head = head.resize((round(head.width * scale), round(head.height * scale)), Image.LANCZOS)
    icon.paste(head, ((SIZE - head.width) // 2, SIZE - head.height + 24), head)
    icon.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main(*sys.argv[1:])
