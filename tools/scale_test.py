"""把角色图缩到游戏内尺寸，贴在游戏风格的地面色上，检查小尺寸下的可读性。
usage: python scale_test.py <输入图> <输出图>"""
import sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
rgb = Image.open(src).convert("RGB")

# 从四角泛洪填充背景，只抠掉与边缘连通的白底，角色身上的白色保留
MARK = (255, 0, 255)
for xy in [(0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)]:
    ImageDraw.floodfill(rgb, xy, MARK, thresh=40)
im = Image.open(src).convert("RGBA")
mask = Image.new("L", rgb.size, 255)
mpx, rpx = mask.load(), rgb.load()
for y in range(rgb.height):
    for x in range(rgb.width):
        if rpx[x, y] == MARK:
            mpx[x, y] = 0
im.putalpha(mask)
im = im.crop(im.getbbox())

heights = [80, 100, 120]
grounds = [(58, 74, 60), (92, 78, 62), (40, 40, 52)]  # 草地 / 土路 / 夜色
cell_w = 140
canvas = Image.new("RGBA", (cell_w * len(heights), 140 * len(grounds)))
for gi, g in enumerate(grounds):
    for hi, h in enumerate(heights):
        cell = Image.new("RGBA", (cell_w, 140), g + (255,))
        w = round(im.width * h / im.height)
        if w > cell_w - 4:  # 姿势太宽时按宽度缩，保持比例
            w, h = cell_w - 4, round(im.height * (cell_w - 4) / im.width)
        sm = im.resize((w, h), Image.LANCZOS)
        cell.alpha_composite(sm, ((cell_w - w) // 2, 140 - h - 6))
        canvas.paste(cell, (hi * cell_w, gi * 140))

# 1:1 是实际观感；再放大 3 倍（最近邻）便于看清像素
canvas.save(dst.replace(".png", "_1x.png"))
canvas.resize((canvas.width * 3, canvas.height * 3), Image.NEAREST).save(dst)
