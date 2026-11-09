import json
from pathlib import Path

from validate_content import validate

GOOD = {
    "id": "place",
    "route": "route-1",
    "number": 1,
    "place": "A Place",
    "region": "Somewhere",
    "message": "A short true message.",
    "field_find": {"name": "Thing", "note": "A note."},
    "alt": "A picture of a place.",
    "sources": [{"title": "Source", "url": "https://example.org", "supports": "everything"}],
    "review": {"status": "approved", "reviewer": "A Reviewer", "date": "2026-11-09"},
}


def write(tmp: Path, name: str, data: object) -> Path:
    folder = tmp / "postcards" / "route-1"
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / f"{name}.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_good_card_passes_strict(tmp_path: Path) -> None:
    write(tmp_path, "place", GOOD)
    report = validate(tmp_path, strict=True)
    assert report.errors == [] and report.warnings == [] and report.checked == 1


def test_unsourced_card_warns_but_fails_strict(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "sources": [], "review": {"status": "pending"}})
    assert validate(tmp_path).errors == []
    assert len(validate(tmp_path).warnings) == 2
    assert len(validate(tmp_path, strict=True).errors) == 2


def test_long_message_is_an_error(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "message": "word " * 61})
    assert any("61 words" in e for e in validate(tmp_path).errors)


def test_id_must_match_file_name(tmp_path: Path) -> None:
    write(tmp_path, "other", GOOD)
    assert any("does not match" in e for e in validate(tmp_path).errors)


def test_insecure_source_url_is_an_error(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "sources": [{"title": "S", "url": "http://example.org"}]})
    assert any("https URL" in e for e in validate(tmp_path).errors)


def test_real_content_has_no_hard_errors() -> None:
    root = Path(__file__).resolve().parent.parent / "content"
    assert validate(root).errors == []
