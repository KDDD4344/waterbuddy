"""Validate WaterBuddy content files.

Hard errors (always fail): malformed JSON, missing required fields, id/file mismatch,
messages over the word limit.
Release checks (fail only with --strict): every postcard needs at least one source and an
approved review. Without --strict these are reported as warnings so work-in-progress
content can live in the repo.

Usage:
    python tools/validate_content.py [content_dir] [--strict]
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

MAX_MESSAGE_WORDS = 60
REQUIRED = ("id", "route", "number", "place", "region", "message", "field_find", "alt", "sources", "review")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked: int = 0


def check_postcard(path: Path, data: object, report: Report, strict: bool, root: Path | None = None) -> None:
    name = path.relative_to(root).as_posix() if root and path.is_relative_to(root) else path.as_posix()
    if not isinstance(data, dict):
        report.errors.append(f"{name}: top level must be an object")
        return
    missing = [k for k in REQUIRED if k not in data]
    if missing:
        report.errors.append(f"{name}: missing {', '.join(missing)}")
        return
    if data["id"] != path.stem:
        report.errors.append(f"{name}: id '{data['id']}' does not match the file name")
    words = len(str(data["message"]).split())
    if words > MAX_MESSAGE_WORDS:
        report.errors.append(f"{name}: message has {words} words (limit {MAX_MESSAGE_WORDS})")
    if not str(data["alt"]).strip():
        report.errors.append(f"{name}: alt text is empty")
    find = data["field_find"]
    if not isinstance(find, dict) or not find.get("name") or not find.get("note"):
        report.errors.append(f"{name}: field_find needs a name and a note")

    release = report.errors if strict else report.warnings
    sources = data["sources"]
    if not isinstance(sources, list) or not sources:
        release.append(f"{name}: no sources yet")
    else:
        for i, s in enumerate(sources):
            if not isinstance(s, dict) or not s.get("title") or not str(s.get("url", "")).startswith("https://"):
                report.errors.append(f"{name}: source {i + 1} needs a title and an https URL")
    review = data["review"]
    if not isinstance(review, dict) or review.get("status") != "approved":
        release.append(f"{name}: not reviewed yet")
    elif not review.get("reviewer") or not review.get("date"):
        report.errors.append(f"{name}: approved review needs a reviewer and a date")


def validate(root: Path, strict: bool = False) -> Report:
    report = Report()
    for path in sorted((root / "postcards").rglob("*.json")):
        report.checked += 1
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            report.errors.append(f"{path.as_posix()}: invalid JSON ({exc.msg}, line {exc.lineno})")
            continue
        check_postcard(path, data, report, strict, root)
    return report


def main(argv: list[str]) -> int:
    strict = "--strict" in argv
    args = [a for a in argv if not a.startswith("--")]
    root = Path(args[0]) if args else Path(__file__).resolve().parent.parent / "content"
    report = validate(root, strict)
    for w in report.warnings:
        print(f"warning: {w}")
    for e in report.errors:
        print(f"error:   {e}")
    print(f"{report.checked} postcard(s) checked, {len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
