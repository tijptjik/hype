#!/usr/bin/env python3
"""Print source-evidenced exit codes and station coverage from an immutable baseline."""
import json
import re
import sys
import unicodedata
from pathlib import Path

codes = {}
root = Path(sys.argv[1])
files = sorted(root.glob('*/amenity_point.json'))
if not files:
    raise SystemExit('No station amenity files found')
for path in files:
    for feature in json.loads(path.read_text())['features']:
        properties = feature['properties']
        name = unicodedata.normalize('NFKC', properties.get('amenity_name_en') or '').strip()
        match = re.fullmatch(r'Exit\s+([A-Z]+\d*[A-Z]?)', name, re.I)
        if properties.get('amenity_category') == 'entry' and match:
            codes.setdefault(match[1].upper(), set()).add(path.parent.name)
print(json.dumps({'baseline': root.parent.name, 'stations': len(files), 'exits': [
    {'code': code, 'stations': sorted(stations)} for code, stations in sorted(codes.items())
]}, indent=2))
