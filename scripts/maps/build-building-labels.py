"""Build interior label points for named OSM buildings and shopping landmarks.

Usage: python3 scripts/maps/build-building-labels.py /path/to/hong-kong.osm.pbf
Requires osmium and Shapely. Retains names and source IDs, not building geometry.
"""
import argparse
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
from shapely.geometry import shape

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="breadline-buildings-") as directory:
    extracted = Path(directory) / "buildings.osm.pbf"
    exported = Path(directory) / "buildings.geojsonseq"
    subprocess.run(["osmium", "tags-filter", str(args.source), "nwr/building",
                    "nwr/shop=mall,department_store", "-o", str(extracted)], check=True)
    # Export each area once, rather than both its outline and its polygon.
    subprocess.run(["osmium", "export", str(extracted), "--geometry-types=point,polygon",
                    "--add-unique-id=type_id", "-o", str(exported)], check=True)
    features = []
    seen = set()
    for line in exported.open():
        feature = json.loads(line.lstrip("\x1e"))
        tags = feature["properties"]
        mall = tags.get("shop") in ("mall", "department_store")
        if not mall and tags.get("building") in (None, "no"):
            continue
        name = tags.get("name") or tags.get("name:en") or tags.get("name:zh")
        if not name or re.fullmatch(r"[\d\s/-]+[A-Za-z]?", name):
            continue
        point = shape(feature["geometry"]).representative_point()
        coords = [round(point.x, 7), round(point.y, 7)]
        identity = (name, *coords)
        if identity in seen:
            continue
        seen.add(identity)
        props = {"kind": "mall" if mall else "building", "name": name}
        for locale, fallback in [("en", None), ("zh-Hant", "zh"), ("zh-Hans", None)]:
            value = tags.get(f"name:{locale}") or (tags.get(f"name:{fallback}") if fallback else None)
            if value and value != name:
                props[f"name:{locale}"] = value
        features.append({"type": "Feature", "id": feature.get("id"), "properties": props,
                         "geometry": {"type": "Point", "coordinates": coords}})
    # A named mall and its containing building often describe the same landmark.
    # Keep the mall label, while leaving similarly named distant buildings intact.
    malls = {}
    for feature in features:
        props = feature["properties"]
        if props["kind"] == "mall":
            key = props.get("name:en", props["name"]).casefold()
            malls.setdefault(key, []).append(feature["geometry"]["coordinates"])
    retained = []
    for feature in features:
        props = feature["properties"]
        x, y = feature["geometry"]["coordinates"]
        key = props.get("name:en", props["name"]).casefold()
        duplicate = props["kind"] == "building" and any(
            math.hypot((a - x) * math.cos(math.radians(y)), b - y) * 111320 < 100
            for a, b in malls.get(key, [])
        )
        if not duplicate:
            retained.append(feature)
    features = retained
    result = {"type": "FeatureCollection", "features": features}
    destination = Path(__file__).resolve().parents[2] / "static/mapData/building-labels.geojson"
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {len(features)} named building and shopping landmark points")
