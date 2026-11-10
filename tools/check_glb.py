"""Check an artist's glTF model against Pip's naming contract before it goes in the app.

Usage:
    python tools/check_glb.py apps/web/public/models/pip.glb

Reads only the file's JSON chunk, so it needs no 3D libraries. The contract lives in
content/art/pip-contract.json and is the same one the app checks at load time.
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = json.loads((ROOT / "content" / "art" / "pip-contract.json").read_text(encoding="utf-8"))
COMPRESSION = {"EXT_meshopt_compression", "KHR_draco_mesh_compression", "KHR_mesh_quantization"}
TRIANGLES = 4  # glTF primitive mode


def read_glb_json(data: bytes) -> dict:
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("not a binary glTF (.glb) file")
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise ValueError(f"glTF version {version}; version 2 is needed")
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:  # "JSON"
        raise ValueError("first chunk is not JSON")
    return json.loads(data[20 : 20 + chunk_len].decode("utf-8"))


def triangle_count(gltf: dict) -> int:
    accessors = gltf.get("accessors", [])
    total = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if prim.get("mode", TRIANGLES) != TRIANGLES:
                continue
            idx = prim.get("indices")
            if idx is not None:
                total += accessors[idx]["count"] // 3
            elif "POSITION" in prim.get("attributes", {}):
                total += accessors[prim["attributes"]["POSITION"]]["count"] // 3
    return total


def check(data: bytes) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []
    try:
        gltf = read_glb_json(data)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [str(exc)], []
    names = {n.get("name") for n in gltf.get("nodes", [])}
    errors += [f'missing node "{n}"' for n in CONTRACT["nodes"] if n not in names]
    clips = {a.get("name") for a in gltf.get("animations", [])}
    errors += [f'missing clip "{c}"' for c in CONTRACT["clips"] if c not in clips]
    tris = triangle_count(gltf)
    if tris > CONTRACT["max_triangles"]:
        errors.append(f"{tris} triangles (limit {CONTRACT['max_triangles']})")
    if len(data) > CONTRACT["max_bytes"]:
        errors.append(
            f"{len(data) / 1024 / 1024:.2f} MB (limit {CONTRACT['max_bytes'] / 1024 / 1024:.1f} MB)"
        )
    if not COMPRESSION & set(gltf.get("extensionsUsed", [])):
        warnings.append("not compressed: run `npm run art:optimize -- in.glb out.glb` in apps/web")
    keys = set()
    for mesh in gltf.get("meshes", []):
        keys |= set((mesh.get("extras") or {}).get("targetNames", []))
    missing_keys = [k for k in CONTRACT["shape_keys"] if k not in keys]
    if missing_keys:
        warnings.append(
            f"no shape keys for {', '.join(missing_keys)} (optional; lids still show expressions)"
        )
    return errors, warnings


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    path = Path(argv[0])
    errors, warnings = check(path.read_bytes())
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error:   {e}")
    print(f"{path.name}: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
