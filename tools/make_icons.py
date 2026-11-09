"""Draw WaterBuddy's app icons as PNG files with no third-party libraries.

Pip's head and eye stalks peek over the waterline on deep water. The maskable
icon keeps everything inside the central safe zone so Android can crop it.

Usage:
    python tools/make_icons.py apps/web/public/icons
"""

from __future__ import annotations

import math
import struct
import sys
import zlib
from pathlib import Path

DEEP = (14, 58, 73)
WATER = (79, 192, 178)
FOAM = (207, 243, 236)
CORAL = (233, 120, 79)
PLATE = (192, 82, 58)
WHITE = (252, 251, 246)
PUPIL = (15, 29, 38)


def _ellipse(x: float, y: float, cx: float, cy: float, rx: float, ry: float) -> bool:
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def _segment(x: float, y: float, ax: float, ay: float, bx: float, by: float, r: float) -> bool:
    px, py, dx, dy = x - ax, y - ay, bx - ax, by - ay
    t = max(0.0, min(1.0, (px * dx + py * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - t * dx, py - t * dy) <= r


def shade(u: float, v: float, scale: float) -> tuple[int, int, int]:
    """Colour at normalised coordinates (0..1). `scale` shrinks the art toward the centre."""
    x = 0.5 + (u - 0.5) / scale
    y = 0.5 + (v - 0.5) / scale
    col = DEEP
    wave = 0.64 + 0.025 * math.sin(x * math.tau * 1.5)
    if y > wave:
        col = WATER
    if abs(y - wave) < 0.012:
        col = FOAM
    # eye stalks
    for sx, ex in ((0.43, 0.38), (0.57, 0.62)):
        if _segment(x, y, sx, 0.5, ex, 0.27, 0.022):
            col = CORAL
    # body (drawn after the water so Pip sits on the surface)
    if _ellipse(x, y, 0.5, 0.56, 0.2, 0.135):
        col = PLATE if y < 0.53 else CORAL
    # eyes
    for ex in (0.38, 0.62):
        if _ellipse(x, y, ex, 0.25, 0.07, 0.07):
            col = WHITE
        if _ellipse(x, y, ex + 0.012, 0.257, 0.036, 0.036):
            col = PUPIL
        if _ellipse(x, y, ex + 0.025, 0.24, 0.011, 0.011):
            col = WHITE
    return col


def render(size: int, scale: float, samples: int = 3) -> bytes:
    rows = []
    n = samples * samples
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            r = g = b = 0
            for sy in range(samples):
                for sx in range(samples):
                    c = shade((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size, scale)
                    r += c[0]
                    g += c[1]
                    b += c[2]
            row += bytes((r // n, g // n, b // n))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path: Path, size: int, raw: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, size, scale in (
        ("icon-192.png", 192, 0.92),
        ("icon-512.png", 512, 0.92),
        ("maskable-512.png", 512, 0.72),
        ("apple-touch-icon.png", 180, 0.86),
    ):
        write_png(out / name, size, render(size, scale))
        print(f"wrote {out / name}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/icons")
