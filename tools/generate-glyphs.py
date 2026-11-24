#!/usr/bin/env python3
"""Create matching digit rasters for the Pebble resource pack and phone preview."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


EM = 64
SOURCES = [
    ("mono/regular.ttf", 700),
    ("mono/regular.ttf", 800),
    ("next/regular.ttf", 700),
    ("next/italic.ttf", 700),
    ("original/bold.ttf", None),
]


def rasterize(font):
    glyphs = []
    for digit in "0123456789":
        left, top, right, bottom = font.getbbox(digit, anchor="ls")
        width, height = right - left, bottom - top
        image = Image.new("L", (width, height))
        ImageDraw.Draw(image).text((-left, -top), digit, font=font, fill=255, anchor="ls")
        stride = (width + 7) // 8
        rows = bytearray(stride * height)
        for y in range(height):
            for x in range(width):
                if image.getpixel((x, y)) >= 128:
                    rows[y * stride + x // 8] |= 0x80 >> (x % 8)
        glyphs.append([width, height, -top, list(rows)])
    return glyphs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("font_sources", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    fonts = []
    for index, (source, weight) in enumerate(SOURCES):
        font = ImageFont.truetype(str(args.font_sources / source), EM)
        if weight is not None:
            font.set_variation_by_axes([weight])
        glyphs = rasterize(font)
        fonts.append(glyphs)
        data = bytearray([EM])
        for width, height, ascent, rows in glyphs:
            data.extend([width, height, ascent])
            data.extend(rows)
        (root / "resources" / f"font-{index}.bin").write_bytes(data)
    (root / "src/pkjs/glyphs.json").write_text(json.dumps({"em": EM, "fonts": fonts}, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
