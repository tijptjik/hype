"""Report source entry labels for former KCR corridors without changing snapshots."""
import argparse
import json
from pathlib import Path

# Includes later corridor extensions/interchanges; Light Rail stops are not indoor venues.
CODES = 'HUH MKK KOT TAW SHT FOT RAC UNI TAP TWO FAN SHS LOW LMC ETS AUS NAC MEF TWW KSR YUL LOP TIS SIH TUM CKT STW CIO SHM TSH HEO MOS WKS'.split()


def audit(root: Path) -> list[dict]:
    """Retain source IDs and floor identities; absent data is not a zero-exit claim."""
    rows = []
    for code in CODES:
        path = root / code / 'amenity_point.json'
        if not path.exists():
            rows.append(dict(station=code, status='missing-snapshot'))
            continue
        entries = [feature for feature in json.loads(path.read_text())['features']
                   if feature['properties'].get('amenity_category') == 'entry']
        rows.append(dict(station=code, status='entries' if entries else 'no-source-entries',
                         entries=[dict(id=f['properties'].get('amenity_id'),
                                       name=f['properties'].get('amenity_name_en'),
                                       floor=f['properties'].get('level_id'),
                                       geometry=f['geometry']) for f in entries]))
    return rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stations', type=Path, help='Immutable baseline stations directory')
    args = parser.parse_args()
    print(json.dumps(audit(args.stations), ensure_ascii=False, indent=2))
