"""Build the postcard images the app loads.

For each postcard whose JSON has "art": true, reads the painted original from
content/art/postcards/<id>.png (or .jpg / .webp) and writes two WebP sizes to
apps/web/public/art/postcards/<id>-800.webp and <id>-1600.webp.

Usage:
    python tools/build_art.py           # build
    python tools/build_art.py --check   # only check the originals (used in CI)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "content" / "art" / "postcards"
OUT = ROOT / "apps" / "web" / "public" / "art" / "postcards"
MIN_W, MIN_H = 1600, 2000
RATIO = 4 / 5
WIDTHS = (800, 1600)


def source_for(card_id: str, folder: Path = SOURCES) -> Path | None:
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = folder / f"{card_id}{ext}"
        if p.exists():
            return p
    return None


def check_image(path: Path) -> list[str]:
    problems = []
    with Image.open(path) as im:
        w, h = im.size
    if w < MIN_W or h < MIN_H:
        problems.append(f"{path.name}: {w}×{h}, needs at least {MIN_W}×{MIN_H}")
    if abs(w / h - RATIO) > 0.02:
        problems.append(f"{path.name}: should be portrait 4:5 (is {w}×{h})")
    return problems


def build_one(src: Path, card_id: str, out: Path = OUT) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")  # drops metadata and alpha
        for width in WIDTHS:
            height = round(width / RATIO)
            resized = ImageOps.fit(im, (width, height), Image.Resampling.LANCZOS)
            target = out / f"{card_id}-{width}.webp"
            resized.save(target, "WEBP", quality=82, method=6)
            written.append(target)
    return written


def cards_with_art(root: Path = ROOT / "content") -> list[str]:
    ids = []
    for path in sorted((root / "postcards").rglob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("art") is True:
            ids.append(data["id"])
    return ids


def main(argv: list[str]) -> int:
    check_only = "--check" in argv
    problems: list[str] = []
    ids = cards_with_art()
    for card_id in ids:
        src = source_for(card_id)
        if not src:
            problems.append(f'{card_id}: "art" is true but content/art/postcards/{card_id}.png is missing')
            continue
        problems += check_image(src)
        if not check_only and not problems:
            for p in build_one(src, card_id):
                print(f"wrote {p.relative_to(ROOT)}")
    for p in problems:
        print(f"error: {p}")
    print(f"{len(ids)} card(s) with art, {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
