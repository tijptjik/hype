#!/usr/bin/env python3
"""Generate private identity evidence for existing Feature splits against a pinned Places mirror."""
import argparse
import collections
import hashlib
import json
import math
import os
import re
import sqlite3
import unicodedata
from pathlib import Path


def normalized(value):
    """Normalize comparable text without interpreting approximate text as identity."""
    return ''.join(c for c in unicodedata.normalize('NFKC', value or '').casefold() if c.isalnum())


def phone(value):
    """Normalize only complete Hong Kong numbers; never use a partial number as evidence."""
    if not isinstance(value, str) or not re.fullmatch(r'[+\d\s().-]+', value):
        return None
    digits = re.sub(r'\D', '', value)
    if digits.startswith('00852'):
        digits = digits[5:]
    elif digits.startswith('852') and len(digits) == 11:
        digits = digits[3:]
    return digits if re.fullmatch(r'[235689]\d{7}', digits) else None


def distance(a, b):
    """Return great-circle metres for two longitude/latitude points."""
    lng1, lat1, lng2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lng2-lng1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def load_places(db, snapshot):
    """Read one selected canonical scope and build text/contact/spatial candidate indexes."""
    states = db.execute('SELECT scopeId FROM placePublicationState WHERE snapshotId=? AND status=?', (snapshot, 'current')).fetchall()
    if len(states) != 1:
        raise ValueError('Mirror does not contain the selected current Place snapshot')
    scope = states[0]['scopeId']
    places, grid = {}, collections.defaultdict(set)
    names, phones = collections.defaultdict(set), collections.defaultdict(set)
    for row in db.execute('SELECT id,geometry,phones,basicCategory,taxonomyPrimary,address2dId,address3dUnitId FROM places WHERE scopeId=?', (scope,)):
        geometry = json.loads(row['geometry'])
        if geometry.get('type') != 'Point':
            continue
        point = geometry['coordinates']
        item = {**dict(row), 'coordinates': point, 'names': {}, 'addresses': {}}
        item.pop('geometry')
        item['phones'] = sorted({p for value in json.loads(row['phones'] or '[]') if (p := phone(value))})
        places[row['id']] = item
        grid[(math.floor(point[0]*400), math.floor(point[1]*400))].add(row['id'])
        for p in item['phones']:
            phones[p].add(row['id'])
    for row in db.execute('SELECT placeId,locale,name,freeformAddress FROM placesI18n WHERE scopeId=?', (scope,)):
        item = places.get(row['placeId'])
        if not item:
            continue
        if row['name']:
            item['names'][row['locale']] = row['name']
            names[normalized(row['name'])].add(row['placeId'])
        if row['freeformAddress']:
            item['addresses'][row['locale']] = row['freeformAddress']
    return places, grid, names, phones


def candidates(plan, index):
    """Rank evidence, keeping shared phones and same-building addresses visibly ambiguous."""
    places, grid, by_name, by_phone = index
    facts = plan['facts']
    geometry = facts['location']['geometry']
    if geometry.get('type') != 'Point':
        return {'state': 'unresolved', 'reason': 'non-point-feature', 'candidates': []}
    point = geometry['coordinates']
    keys = {normalized(v) for v in facts['names'].values()} - {''}
    contact = {p for v in facts.get('phoneNumber') or [] if (p := phone(v))}
    addresses = {normalized(v) for v in facts['location']['address'].get('fallbackDisplay', {}).values()} - {''}
    x, y = math.floor(point[0]*400), math.floor(point[1]*400)
    ids = set()
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            ids.update(grid.get((x+dx, y+dy), ()))
    for key in keys:
        ids.update(by_name.get(key, ()))
    for p in contact:
        ids.update(by_phone.get(p, ()))
    found = []
    for pid in ids:
        item = places[pid]
        metres = distance(point, item['coordinates'])
        exact_name = bool(keys & {normalized(v) for v in item['names'].values()})
        matched_phones = contact & set(item['phones'])
        unique_phone = any(len(by_phone[p]) == 1 for p in matched_phones)
        if metres > 250 and not exact_name and not matched_phones:
            continue
        exact_address = bool(addresses & {normalized(v) for v in item['addresses'].values()})
        evidence = {'exactLocalizedName': exact_name, 'matchedPhoneCount': len(matched_phones),
                    'uniquePhoneInPublication': unique_phone, 'exactFreeformAddress': exact_address}
        # This is a review priority, never an accepted identity or automatic migration link.
        corroborated = exact_name and unique_phone and metres <= 50
        found.append({'id': pid, 'names': item['names'], 'addresses': item['addresses'], 'coordinates': item['coordinates'],
                      'basicCategory': item['basicCategory'], 'taxonomyPrimary': item['taxonomyPrimary'],
                      'address2dId': item['address2dId'], 'address3dUnitId': item['address3dUnitId'],
                      'distanceMetres': round(metres, 1), 'evidence': evidence,
                      'reviewPriority': 'corroborated' if corroborated else 'candidate'})
    found.sort(key=lambda item: (item['reviewPriority'] != 'corroborated',
                                not item['evidence']['exactLocalizedName'],
                                not item['evidence']['uniquePhoneInPublication'],
                                not item['evidence']['matchedPhoneCount'],
                                not item['evidence']['exactFreeformAddress'],
                                item['distanceMetres'], item['id']))
    identity_evidence = any(item['evidence']['exactLocalizedName'] or item['evidence']['matchedPhoneCount'] or item['evidence']['exactFreeformAddress'] for item in found)
    return {'state': 'review' if identity_evidence else 'unresolved',
            'reason': 'candidate-evidence' if identity_evidence else ('nearby-only' if found else 'no-candidate'),
            'candidateCount': len(found), 'candidates': found[:5]}


def main():
    """Write reproducible private proposals; never alter Features, Places or shared source data."""
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['plan', 'saanseoi', 'publication', 'output']:
        parser.add_argument('--'+key, required=True)
    parser.add_argument('--immutable-snapshot', action='store_true', help='Use only for a sealed SQLite export without a WAL')
    args = parser.parse_args()
    os.umask(0o077)
    raw = Path(args.plan).read_bytes()
    plan = json.loads(raw)
    if plan.get('version') != 1 or plan.get('strategy') != 'unresolved-with-preserved-values':
        raise ValueError('Expected a current Feature split manifest')
    ids = [item['featureId'] for item in plan['plans']]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate Feature in split manifest')
    publication = json.loads(Path(args.publication).read_text())
    snapshot = publication['data'][0]['attributes']['snapshotId']
    path = Path(args.saanseoi).resolve()
    if args.immutable_snapshot and Path(str(path)+'-wal').exists():
        raise ValueError('Immutable source has a WAL; use a transaction-consistent read instead')
    db = sqlite3.connect(path.as_uri()+'?mode=ro'+('&immutable=1' if args.immutable_snapshot else ''), uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    try:
        index = load_places(db, snapshot)
        records = [{'featureId': item['featureId'], 'projectId': item['projectId'],
                    'expectedFeatureModifiedAt': item['expectedFeatureModifiedAt'],
                    'names': item['facts']['names'],
                    'coordinates': item['facts']['location']['geometry']['coordinates'],
                    'addresses': item['facts']['location']['address'].get('fallbackDisplay', {}),
                    **candidates(item, index)} for item in plan['plans']]
    finally:
        db.close()
    counts = dict(collections.Counter(item['reason'] for item in records))
    summary = {'eligibleFeatures': len(records), 'excludedFeatures': len(plan['exclusions']),
               'canonicalPlaces': len(index[0]), 'counts': counts,
               'exactNameCandidates': sum(any(c['evidence']['exactLocalizedName'] for c in r['candidates']) for r in records),
               'corroboratedCandidates': sum(any(c['reviewPriority']=='corroborated' for c in r['candidates']) for r in records)}
    output = {'version': 1, 'planSha256': hashlib.sha256(raw).hexdigest(),
              'publication': publication['meta'], 'permalink': publication['links']['permalink'],
              'snapshotId': snapshot, 'summary': summary, 'records': records,
              'exclusions': plan['exclusions'], 'acceptance': 'Evidence only; no identities accepted or migration links authorized.'}
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True)+'\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
