"""Build a small OSM entrance overlay without losing exit references in vector tiles.

Usage: python3 scripts/maps/build-mtr-entrances.py /path/to/hong-kong.osm.pbf
Requires osmium. Output retains only location, OSM ID and current exit reference.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="breadline-mtr-") as directory:
    extracted = Path(directory) / "entrances.osm"
    subprocess.run([
        "osmium", "tags-filter", str(args.source), "n/railway=subway_entrance",
        "-o", str(extracted),
    ], check=True)
    features = []
    for node in ET.parse(extracted).getroot().findall("node"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in node.findall("tag")}
        # Never revive former exit numbers or guess references for unnumbered lifts.
        ref = "" if tags.get("noref") == "yes" else (
            tags.get("ref") or tags.get("local_ref") or tags.get("loc_ref") or ""
        )
        features.append({
            "type": "Feature", "id": int(node.attrib["id"]),
            "properties": {"kind": "subway_entrance", "ref": ref},
            "geometry": {"type": "Point", "coordinates": [
                float(node.attrib["lon"]), float(node.attrib["lat"]),
            ]},
        })
    result = {"type": "FeatureCollection", "features": sorted(features, key=lambda f: f["id"])}
    destination = Path(__file__).resolve().parents[2] / "static/mapData/mtr-entrances.geojson"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(f"Wrote {len(features)} entrances; {sum(bool(f['properties']['ref']) for f in features)} referenced")
