"""Draw WaterBuddy's app icons as PNG files with no third-party libraries.

The same Pip as favicon.svg (drawn on a 24-unit grid so he reads at icon size): a coral
dome on the waterline, two big eyes on stalks, one claw. The maskable icon keeps
everything inside the central safe zone, and the badge is a white silhouette for
Android's notification bar.

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


PLATE_LINE = (181, 69, 46)


def _pip(x: float, y: float) -> str | None:
    """Which part of Pip is at (x, y) on the 24-unit grid of favicon.svg, or None."""
    for ex in (7.8, 16.2):
        if math.hypot(x - ex - 0.6, y - 5.7) <= 1.45:
            return "pupil"
        if math.hypot(x - ex, y - 5.4) <= 2.7:
            return "eye"
    if _segment(x, y, 19.6, 12.4, 21.6, 11.0, 0.45):
        return "notch"
    if math.hypot(x - 19.6, y - 12.4) <= 2.3:
        return "body"
    if y <= 17.2 and _ellipse(x, y, 12, 17.2, 7.4, 5.6):
        r = math.hypot((x - 12) / 7.4, (y - 16.86) / 5.6)
        return "plate" if abs(r - 1) < 0.1 and y < 13.6 else "body"
    for sx, sy, ex, ey in ((9.6, 12, 8, 6.6), (14.4, 12, 16, 6.6)):
        if _segment(x, y, sx, sy, ex, ey, 0.85):
            return "body"
    return None


def shade(u: float, v: float, scale: float) -> tuple[int, int, int]:
    """Colour at normalised coordinates (0..1). `scale` shrinks the art toward the centre."""
    x = (0.5 + (u - 0.5) / scale) * 24
    y = (0.5 + (v - 0.5) / scale) * 24
    part = _pip(x, y)
    if part == "pupil":
        return PUPIL
    if part == "eye":
        return WHITE
    if part == "notch":
        return DEEP
    if part == "plate":
        return PLATE_LINE
    if part == "body":
        return CORAL
    if abs(y - 17) < 0.45:
        return FOAM
    return WATER if y > 17 else DEEP


def badge_alpha(u: float, v: float) -> int:
    """Android notification badge: Pip as a white silhouette, pupils cut out."""
    part = _pip(u * 24 * 0.92 + 0.96, v * 24 * 0.92 + 0.3)
    return 255 if part in ("eye", "body", "plate") else 0


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


def render_badge(size: int, samples: int = 3) -> bytes:
    rows = []
    n = samples * samples
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            a = sum(
                badge_alpha((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size)
                for sy in range(samples)
                for sx in range(samples)
            )
            row += bytes((255, 255, 255, a // n))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path: Path, size: int, raw: bytes, alpha: bool = False) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6 if alpha else 2, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
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
    write_png(out / "badge-96.png", 96, render_badge(96), alpha=True)
    print(f"wrote {out / 'badge-96.png'}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "apps/web/public/icons")
