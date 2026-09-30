"""Cut a character out of its white background and export it at in-game size.
usage: python cutout.py <in> <out.png> <height>
Flood-fills the background from the four corners, so white inside the character is kept."""
import sys
from PIL import Image, ImageDraw


def cutout(src):
    rgb = Image.open(src).convert("RGB")
    mark = (255, 0, 255)
    for xy in [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]:
        ImageDraw.floodfill(rgb, xy, mark, thresh=40)
    im = Image.open(src).convert("RGBA")
    mask = Image.new("L", rgb.size, 255)
    mp, rp = mask.load(), rgb.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            if rp[x, y] == mark:
                mp[x, y] = 0
    im.putalpha(mask)
    return im.crop(im.getbbox())


if __name__ == "__main__":
    src, dst, h = sys.argv[1], sys.argv[2], int(sys.argv[3])
    im = cutout(src)
    im.resize((round(im.width * h / im.height), h), Image.LANCZOS).save(dst, optimize=True)
