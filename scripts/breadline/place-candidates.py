#!/usr/bin/env python3
"""Build private, review-only Location candidates from fresh Breadline and pinned SaanSeoi mirrors."""
import argparse
import importlib.util
import json
import math
import os
import sqlite3
from pathlib import Path

# Both migration cohorts use the same review-only evidence rules.
_spec = importlib.util.spec_from_file_location(
    'feature_location_matcher', Path(__file__).resolve().parents[1] / 'locations' / 'match-feature-places.py')
matcher = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(matcher)


def candidate_record(row, table, index, corrections):
    """Rank a source row using names, complete phones and addresses without accepting identity."""
    sid = str(row['id'])
    point = [float(row['longitude']), float(row['latitude'])]
    if table == 'donors' and sid in corrections:
        if point != corrections[sid]['original']:
            raise ValueError(f'Reviewed coordinates changed for donor {sid}')
        point = corrections[sid]['corrected']
    if not all(math.isfinite(value) for value in point) or not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
        raise ValueError(f'Invalid coordinates for {table} {sid}')
    names = {key: row[column] for key, column in [('en', 'name_en'), ('zh-hant', 'name_zh')] if row[column]}
    addresses = {key: row[column] for key, column in [('en', 'address_full_en'), ('zh-hant', 'address_full_zh')] if row[column]}
    raw_phone = row['phone'] if table == 'donors' else None
    plan = {'facts': {'names': names, 'phoneNumber': [raw_phone] if raw_phone else [],
                     'location': {'geometry': {'type': 'Point', 'coordinates': point},
                                  'address': {'fallbackDisplay': addresses}}}}
    return {'table': table, 'id': sid, 'sourceHash': row['_breadline_row_hash'],
            'names': names, 'addresses': addresses, 'coordinates': point,
            'phoneEvidence': 'absent' if not raw_phone else 'complete' if matcher.phone(raw_phone) else 'unusable',
            **matcher.candidates(plan, index)}


def connect(path, immutable=False):
    """Open a read-only, transaction-consistent source without mutating its contents."""
    path = Path(path).resolve()
    if immutable and Path(str(path) + '-wal').exists():
        raise ValueError('Immutable source has a WAL; use a consistent transaction instead')
    db = sqlite3.connect(path.as_uri() + '?mode=ro' + ('&immutable=1' if immutable else ''), uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    return db


def main():
    """Generate candidate evidence and aggregate counts; never accept matches or write Features."""
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ['breadline', 'hype', 'saanseoi', 'publication', 'output']:
        parser.add_argument('--'+arg, required=True)
    parser.add_argument('--immutable-snapshot', action='store_true', help='SaanSeoi input is a sealed export without WAL')
    args = parser.parse_args()
    os.umask(0o077)
    publication = json.loads(Path(args.publication).read_text())
    snapshot = publication['data'][0]['attributes']['snapshotId']
    source, target = map(connect, [args.breadline, args.hype])
    ss = connect(args.saanseoi, args.immutable_snapshot)
    try:
        index = matcher.load_places(ss, snapshot)
        policy = json.loads(Path('scripts/breadline/donor-import-policy.json').read_text())
        corrections = json.loads(Path('scripts/breadline/feature-coordinate-corrections.json').read_text())
        runs = {str(row[0]) for row in source.execute('SELECT DISTINCT donor_id FROM breadline__public__runs')}
        items, excluded = [], []
        for table in ['donors', 'dropoffs']:
            for row in source.execute(f'SELECT * FROM breadline__public__{table} ORDER BY id'):
                sid = str(row['id'])
                if table == 'donors' and (row['id'] in policy['excludedDonorIds'] or (policy['requireRecordedRun'] and sid not in runs)):
                    excluded.append({'table':table, 'id':sid, 'reason':'explicit_exclusion' if row['id'] in policy['excludedDonorIds'] else 'no_recorded_runs'})
                    continue
                items.append(candidate_record(row, table, index, corrections))
        summary = {'eligibleDonors':sum(x['table']=='donors' for x in items),'dropoffs':sum(x['table']=='dropoffs' for x in items),
            'excludedDonors':len(excluded),'withCandidates':sum(bool(x['candidates']) for x in items),
            'withExactNameCandidates':sum(any(c['evidence']['exactLocalizedName'] for c in x['candidates']) for x in items),
            'existingHypeFeatures':target.execute('SELECT count(*) FROM feature').fetchone()[0], 'canonicalPlaces':len(index[0]),
            'withPhoneCandidates':sum(any(c['evidence']['matchedPhoneCount'] for c in x['candidates']) for x in items),
            'withAddressCandidates':sum(any(c['evidence']['exactFreeformAddress'] for c in x['candidates']) for x in items),
            'corroboratedCandidates':sum(any(c['reviewPriority']=='corroborated' for c in x['candidates']) for x in items),
            'nearbyOnly':sum(x['reason']=='nearby-only' for x in items),
            'unusableSourcePhones':sum(x['phoneEvidence']=='unusable' for x in items)}
        evidence = {'version':2,'publication':publication['meta'],'permalink':publication['links']['permalink'],
            'snapshotId':snapshot,'policy':policy,'summary':summary,'records':items,'excluded':excluded,
            'acceptance':'Review only. Distance, brand and names alone do not authorize shared Location identity.'}
        out = Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
        print(json.dumps(summary))
    finally:
        for db in [source,target,ss]:db.close()


if __name__ == '__main__':
    main()
