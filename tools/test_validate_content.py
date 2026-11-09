import json
from pathlib import Path

from validate_content import validate

GOOD = {
    "id": "place",
    "route": "route-1",
    "number": 1,
    "place": "A Place",
    "region": "Somewhere",
    "coordinates": "12.3°N 45.6°E",
    "scene": "lagoon",
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


def test_unsourced_card_is_always_rejected(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "sources": []})
    assert any("no sources" in e for e in validate(tmp_path).errors)


def test_unreviewed_card_warns_but_fails_strict(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "review": {"status": "pending"}})
    assert validate(tmp_path).errors == []
    assert len(validate(tmp_path).warnings) == 1
    assert len(validate(tmp_path, strict=True).errors) == 1


def test_unknown_scene_is_an_error(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "scene": "volcano"})
    assert any("unknown scene" in e for e in validate(tmp_path).errors)


def test_route_numbers_must_not_skip(tmp_path: Path) -> None:
    write(tmp_path, "place", GOOD)
    write(tmp_path, "other", {**GOOD, "id": "other", "number": 3})
    assert any("no gaps" in e for e in validate(tmp_path).errors)


def test_coordinates_format(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "coordinates": "north-ish"})
    assert any("coordinates" in e for e in validate(tmp_path).errors)


def test_long_message_is_an_error(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "message": "word " * 61})
    assert any("61 words" in e for e in validate(tmp_path).errors)


def test_id_must_match_file_name(tmp_path: Path) -> None:
    write(tmp_path, "other", GOOD)
    assert any("does not match" in e for e in validate(tmp_path).errors)


def test_insecure_source_url_is_an_error(tmp_path: Path) -> None:
    write(tmp_path, "place", {**GOOD, "sources": [{"title": "S", "url": "http://example.org"}]})
    assert any("https URL" in e for e in validate(tmp_path).errors)


GOALS = {
    "bands": [
        {
            "id": "18-64",
            "label": "18 to 64",
            "suggested_ml": 2000,
            "range_ml": [1200, 3500],
            "parent_setup": False,
            "why": "A reason.",
            "source_ids": ["nin"],
        }
    ],
    "sources": [{"id": "nin", "title": "NIN", "url": "https://example.org"}],
    "review": {"status": "approved", "reviewer": "A Reviewer", "date": "2026-11-09"},
}


def write_goals(tmp: Path, data: object) -> None:
    (tmp / "goals.json").write_text(json.dumps(data), encoding="utf-8")


def test_good_goals_pass_strict(tmp_path: Path) -> None:
    write_goals(tmp_path, GOALS)
    report = validate(tmp_path, strict=True)
    assert report.errors == [] and report.warnings == []


def test_goal_band_with_unknown_source_is_an_error(tmp_path: Path) -> None:
    band = {**GOALS["bands"][0], "source_ids": ["missing"]}
    write_goals(tmp_path, {**GOALS, "bands": [band]})
    assert any("unknown source" in e for e in validate(tmp_path).errors)


def test_goal_suggestion_outside_range_is_an_error(tmp_path: Path) -> None:
    band = {**GOALS["bands"][0], "suggested_ml": 4000}
    write_goals(tmp_path, {**GOALS, "bands": [band]})
    assert any("inside its range" in e for e in validate(tmp_path).errors)


def test_unreviewed_goals_warn_but_fail_strict(tmp_path: Path) -> None:
    write_goals(tmp_path, {**GOALS, "review": {"status": "pending"}})
    assert validate(tmp_path).errors == []
    assert any("not reviewed" in e for e in validate(tmp_path, strict=True).errors)


TASK = {
    "id": "t1",
    "day": 1,
    "type": "check",
    "title": "Fill a bottle",
    "body": "Before bed.",
    "confirm": "Done",
    "sticker": "moon",
}


def write_tasks(tmp: Path, tasks: list) -> None:
    (tmp / "field-tasks.json").write_text(json.dumps({"tasks": tasks}), encoding="utf-8")


def test_good_tasks_pass(tmp_path: Path) -> None:
    write_tasks(tmp_path, [TASK, {**TASK, "id": "t2", "day": 2, "sticker": "owl"}])
    assert validate(tmp_path).errors == []


def test_tasks_must_not_push_volume(tmp_path: Path) -> None:
    write_tasks(tmp_path, [{**TASK, "body": "Drink more water today!"}])
    assert any("never push for more water" in e for e in validate(tmp_path).errors)


def test_task_days_must_be_consecutive(tmp_path: Path) -> None:
    write_tasks(tmp_path, [TASK, {**TASK, "id": "t3", "day": 3, "sticker": "owl"}])
    assert any("no gaps" in e for e in validate(tmp_path).errors)


def test_cue_tasks_need_an_answer_slot(tmp_path: Path) -> None:
    cue = {**TASK, "type": "cue", "sentence": "I will drink.", "options": ["a", "b"]}
    write_tasks(tmp_path, [cue])
    assert any("{answer}" in e for e in validate(tmp_path).errors)


def test_real_content_has_no_hard_errors() -> None:
    root = Path(__file__).resolve().parent.parent / "content"
    assert validate(root).errors == []
