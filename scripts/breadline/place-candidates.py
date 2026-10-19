#!/usr/bin/env python3
"""Build private, review-only Place candidates from fresh Breadline and pinned SaanSeoi mirrors."""
import argparse
import collections
import json
import math
import os
import sqlite3
import unicodedata
from pathlib import Path


def normalized(value):
    """Normalize name evidence without treating a brand or distance as identity."""
    return ''.join(c for c in unicodedata.normalize('NFKC', value or '').casefold() if c.isalnum())


def distance(a, b):
    """Return great-circle metres between longitude/latitude pairs."""
    lng1, lat1, lng2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def connect(path):
    """Open a read-only, transaction-consistent source without mutating its contents."""
    db = sqlite3.connect(f'file:{Path(path).resolve()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    return db


def main():
    """Generate candidate evidence and aggregate counts; never accept matches or write Features."""
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ['breadline', 'hype', 'saanseoi', 'publication', 'output']:
        parser.add_argument('--'+arg, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    publication = json.loads(Path(args.publication).read_text())
    snapshot = publication['data'][0]['attributes']['snapshotId']
    source, target, ss = map(connect, [args.breadline, args.hype, args.saanseoi])
    try:
        states = ss.execute('SELECT * FROM placePublicationState WHERE snapshotId=? AND status=?', (snapshot, 'current')).fetchall()
        if len(states) != 1:
            raise ValueError('SaanSeoi mirror does not contain the pinned current publication')
        scope = states[0]['scopeId']
        places = {}
        grid = collections.defaultdict(list)
        by_name = collections.defaultdict(set)
        for row in ss.execute('SELECT id,geometry,basicCategory,taxonomyPrimary,address2dId,address3dUnitId FROM places WHERE scopeId=?', (scope,)):
            geometry = json.loads(row['geometry'])
            if geometry.get('type') != 'Point':
                continue
            point = geometry['coordinates']
            places[row['id']] = {**dict(row), 'coordinates': point, 'names': {}, 'brands': {}}
            places[row['id']].pop('geometry')
            grid[(math.floor(point[0]*400), math.floor(point[1]*400))].append(row['id'])
        for row in ss.execute('SELECT placeId,locale,name,brandName FROM placesI18n WHERE scopeId=?', (scope,)):
            place = places.get(row['placeId'])
            if not place:
                continue
            if row['name']:
                place['names'][row['locale']] = row['name']
                by_name[normalized(row['name'])].add(row['placeId'])
            if row['brandName']:
                place['brands'][row['locale']] = row['brandName']
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
                point = [float(row['longitude']), float(row['latitude'])]
                if table == 'donors' and sid in corrections:
                    if point != corrections[sid]['original']:
                        raise ValueError('Reviewed source coordinates changed')
                    point = corrections[sid]['corrected']
                keys = {normalized(row['name_en']), normalized(row['name_zh'])} - {''}
                x, y = math.floor(point[0]*400), math.floor(point[1]*400)
                ids = set()
                for dx in range(-2,3):
                    for dy in range(-2,3):
                        ids.update(grid[(x+dx,y+dy)])
                for key in keys:
                    ids.update(by_name[key])
                candidates = []
                for pid in ids:
                    place = places[pid]
                    metres = distance(point, place['coordinates'])
                    exact = bool(keys & {normalized(v) for v in place['names'].values()})
                    if metres > 250 and not exact:
                        continue
                    candidates.append({**place, 'distanceMetres':round(metres,1), 'exactLocalizedName':exact})
                candidates.sort(key=lambda value: (not value['exactLocalizedName'],value['distanceMetres'],value['id']))
                items.append({'table':table,'id':sid,'sourceHash':row['_breadline_row_hash'],
                    'names':{'en':row['name_en'],'zh-hant':row['name_zh']}, 'coordinates':point,
                    'state':'review' if candidates else 'unresolved','candidates':candidates[:5]})
        summary = {'eligibleDonors':sum(x['table']=='donors' for x in items),'dropoffs':sum(x['table']=='dropoffs' for x in items),
            'excludedDonors':len(excluded),'withCandidates':sum(bool(x['candidates']) for x in items),
            'withExactNameCandidates':sum(any(c['exactLocalizedName'] for c in x['candidates']) for x in items),
            'existingHypeFeatures':target.execute('SELECT count(*) FROM feature').fetchone()[0], 'canonicalPlaces':len(places)}
        evidence = {'version':1,'publication':publication['meta'],'permalink':publication['links']['permalink'],
            'snapshotId':snapshot,'policy':policy,'summary':summary,'records':items,'excluded':excluded,
            'acceptance':'Review only. Distance, brand and names alone do not authorize shared Place identity.'}
        out = Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(evidence,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
        print(json.dumps(summary))
    finally:
        for db in [source,target,ss]:db.close()


if __name__ == '__main__':
    main()
