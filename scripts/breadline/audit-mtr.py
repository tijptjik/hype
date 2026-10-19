#!/usr/bin/env python3
"""Compare derived MTR access with private Breadline reference data without writes.

Usage: python3 scripts/breadline/audit-mtr.py --source mirror.sqlite
       --target rehearsal.sqlite --output private-report.json
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import sqlite3


def normalized(value):
    """Normalize station spelling and spacing without merging distinct stations."""
    return re.sub(r'[\s\-]', '', (value or '').casefold().removesuffix('站'))


def audit(source_path, target_path, output_path):
    """Write a private row-level comparison and print aggregate-only results."""
    os.umask(0o077)
    catalog = json.loads(Path('src/lib/routing/mtr-catalog.json').read_text())
    stations = {station['id']: station for station in catalog['stations']}
    exits = {exit['id']: exit for exit in catalog['exits']}
    aliases = {}
    for station in stations.values():
        for name in [station['name'], station['nameZh']]:
            aliases.setdefault(normalized(name), set()).add(station['id'])
    aliases[normalized('Tsim Sha Tsui East')] = aliases[normalized('East Tsim Sha Tsui')]
    source = sqlite3.connect(Path(source_path).resolve().as_uri() + '?mode=ro', uri=True)
    target = sqlite3.connect(Path(target_path).resolve().as_uri() + '?mode=ro', uri=True)
    source.row_factory = target.row_factory = sqlite3.Row
    imported = {row['sourceId']: dict(row) for row in target.execute('''
        SELECT b.sourceId,f.id,f.mtrStation,f.mtrExit,f.mtrDistance,f.mtrResolution
        FROM breadlineImportFeature b JOIN feature f ON f.id=b.featureId
        WHERE b.sourceTable='donors'
    ''')}
    rows = []
    for source_row in source.execute('''SELECT id,nearest_mtr_station_en,
            nearest_mtr_station_zh,nearest_mtr_exit FROM breadline__public__donors ORDER BY id'''):
        row = dict(source_row)
        feature = imported.get(str(row['id']))
        candidates = set()
        for name in [row['nearest_mtr_station_en'], row['nearest_mtr_station_zh']]:
            candidates.update(aliases.get(normalized(name), set()))
        reference = next(iter(candidates)) if len(candidates) == 1 else None
        has_reference = bool(row['nearest_mtr_station_en'] or row['nearest_mtr_station_zh'])
        if not feature:
            status = 'not_imported'
        elif not has_reference:
            status = 'no_source_station'
        elif normalized(row['nearest_mtr_station_en']) == normalized('West Kowloon Rail'):
            status = 'outside_local_mtr_scope'
        elif not reference:
            status = 'unmapped_or_ambiguous_source_station'
        elif not feature['mtrStation']:
            status = 'derived_unresolved'
        else:
            status = 'station_match' if reference == feature['mtrStation'] else 'station_mismatch'
        derived_exit = exits.get(feature['mtrExit']) if feature else None
        source_exit = (row['nearest_mtr_exit'] or '').strip()
        exit_status = 'not_comparable'
        if status == 'station_match' and source_exit and derived_exit and derived_exit['ref']:
            exit_status = 'exit_match' if normalized(source_exit) == normalized(derived_exit['ref']) else 'exit_differs'
        rows.append({**row, 'sourceStationCode': reference, 'status': status,
                     'derivedStationCode': feature['mtrStation'] if feature else None,
                     'derivedStationName': stations.get(feature['mtrStation'], {}).get('name') if feature else None,
                     'derivedExit': derived_exit['ref'] if derived_exit else None,
                     'exitComparison': exit_status,
                     'walkingMetres': feature['mtrDistance'] if feature else None,
                     'stationAssociation': derived_exit['association'] if derived_exit else None})
    summary = {'donors': len(rows), 'stations': dict(Counter(row['status'] for row in rows)),
               'exits': dict(Counter(row['exitComparison'] for row in rows)),
               'fallbackStations': dict(Counter(row['status'] for row in rows if row['stationAssociation'] == 'nearest_station'))}
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'summary': summary, 'rows': rows}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary))
    source.close()
    target.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    audit(args.source, args.target, args.output)
