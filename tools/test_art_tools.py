import json
import struct
from pathlib import Path

from build_art import build_one, check_image
from check_glb import CONTRACT, check
from PIL import Image
from test_validate_content import GOOD, write
from validate_content import validate


def glb(gltf: dict, pad_to: int = 0) -> bytes:
    body = json.dumps(gltf).encode()
    body += b" " * ((4 - len(body) % 4) % 4)
    total = 12 + 8 + len(body)
    out = b"glTF" + struct.pack("<II", 2, total) + struct.pack("<II", len(body), 0x4E4F534A) + body
    return out + b"\0" * max(0, pad_to - len(out))


def good_gltf(**extra) -> dict:
    return {
        "asset": {"version": "2.0"},
        "nodes": [{"name": n} for n in CONTRACT["nodes"]],
        "animations": [{"name": c, "channels": [], "samplers": []} for c in CONTRACT["clips"]],
        "accessors": [{"count": 3000}],
        "meshes": [
            {
                "primitives": [{"attributes": {}, "indices": 0}],
                "extras": {"targetNames": CONTRACT["shape_keys"]},
            }
        ],
        "extensionsUsed": ["EXT_meshopt_compression"],
        **extra,
    }


def test_good_model_passes():
    errors, warnings = check(glb(good_gltf()))
    assert errors == [] and warnings == []


def test_missing_names_and_clips_are_errors():
    g = good_gltf()
    g["nodes"] = [n for n in g["nodes"] if n["name"] != "Mouth"]
    g["animations"] = g["animations"][:1]
    errors, _ = check(glb(g))
    assert 'missing node "Mouth"' in errors
    assert 'missing clip "cork"' in errors


def test_budgets():
    g = good_gltf(accessors=[{"count": (CONTRACT["max_triangles"] + 10) * 3}])
    errors, _ = check(glb(g, pad_to=CONTRACT["max_bytes"] + 100))
    assert any("triangles" in e for e in errors)
    assert any("MB" in e for e in errors)


def test_uncompressed_model_warns():
    _, warnings = check(glb(good_gltf(extensionsUsed=[])))
    assert any("art:optimize" in w for w in warnings)


def test_not_a_glb():
    errors, _ = check(b"hello")
    assert errors


def test_postcard_image_checks_and_builds(tmp_path: Path):
    small = tmp_path / "small.png"
    Image.new("RGB", (800, 1000), "#6FB7B0").save(small)
    assert any("at least" in p for p in check_image(small))
    wide = tmp_path / "wide.png"
    Image.new("RGB", (2400, 1600), "#6FB7B0").save(wide)
    assert any("4:5" in p for p in check_image(wide))
    good = tmp_path / "loktak.png"
    Image.new("RGBA", (1600, 2000), "#6FB7B0").save(good)
    assert check_image(good) == []
    out = build_one(good, "loktak", tmp_path / "out")
    assert [p.name for p in out] == ["loktak-800.webp", "loktak-1600.webp"]
    with Image.open(out[1]) as im:
        assert im.size == (1600, 2000) and im.format == "WEBP"


def test_validator_wants_the_original_when_art_is_on(tmp_path: Path):
    write(tmp_path, "place", {**GOOD, "art": True})
    assert any("missing" in e for e in validate(tmp_path).errors)
    (tmp_path / "art" / "postcards").mkdir(parents=True)
    Image.new("RGB", (1600, 2000)).save(tmp_path / "art" / "postcards" / "place.png")
    assert validate(tmp_path).errors == []
