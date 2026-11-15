"""Prepare a source-preserving MTR Location onboarding plan (Refs #194); never write a database."""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOTS = {'KET': 'kennedy-town', 'HOK': 'hong-kong'}


def source_names(properties, prefix):
    """Retain only supplied labels; do not manufacture translations or unit codes."""
    return {locale: properties[key] for locale, key in
            [('en', prefix + '_name_en'), ('zh-Hant', prefix + '_name_zh')]
            if properties.get(key)}


def read_snapshot(directory):
    """Check retained bytes and complete counts before interpreting source identities."""
    manifest = json.loads((directory / 'manifest.json').read_text())
    layers = {}
    for entry in manifest['entries']:
        raw = (directory / (entry['layer'] + '.json')).read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry['sha256']:
            raise ValueError('Snapshot hash mismatch: ' + entry['layer'])
        layer = json.loads(raw)
        if len(layer['features']) != entry['count'] or layer['totalFeatures'] != entry['count']:
            raise ValueError('Incomplete snapshot: ' + entry['layer'])
        if any(f['properties']['venue_id'] != manifest['venueId'] for f in layer['features']):
            raise ValueError('Unexpected venue')
        layers[entry['layer']] = layer['features']
    return manifest, layers


def indexed(features, key):
    """Reject missing or duplicate source identities instead of silently coalescing them."""
    result = {}
    for feature in features:
        identity = feature['properties'].get(key)
        if not identity or identity in result:
            raise ValueError('Missing or duplicate ' + key)
        result[identity] = feature
    return result



def contains_point(geometry, point):
    """Check supplied XY placement, respecting holes; Z is retained separately in source evidence."""
    def ring_contains(ring):
        inside = False
        x, y = point[:2]
        for a, b in zip(ring, ring[1:]):
            ax, ay = a[:2]
            bx, by = b[:2]
            cross = (x-ax)*(by-ay)-(y-ay)*(bx-ax)
            if abs(cross) < 1e-14 and min(ax,bx)-1e-10 <= x <= max(ax,bx)+1e-10 and min(ay,by)-1e-10 <= y <= max(ay,by)+1e-10:
                return True
            if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
                inside = not inside
        return inside
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    return any(ring_contains(p[0]) and not any(ring_contains(h) for h in p[1:]) for p in polygons)


def audit_occupants(layers):
    """Separate code placeholders, shared areas and repeated names before any identity creation."""
    units = indexed(layers['unit_polygon'], 'unit_id')
    groups = defaultdict(list)
    for f in layers['occupant_point']:
        groups[f['properties']['unit_id']].append(f)
    result = {}
    for unit_id, occupants in groups.items():
        unit = units[unit_id]
        names = Counter((f['properties'].get('occupant_name_en') or '').strip().casefold() for f in occupants)
        for feature in occupants:
            p = feature['properties']
            name = (p.get('occupant_name_en') or '').strip()
            reasons = []
            if not name or re.fullmatch(r'(?:KET|HOK)\s*\d+[A-Z]?(?:\s*[-/&]\s*\d+[A-Z]?)*', name, re.I):
                reasons.append('code-only-or-unnamed')
            if unit['properties'].get('unit_category') in ('lobby', 'walkway', 'platform'):
                reasons.append('shared-area-not-exclusive-shop-unit')
            if names[name.casefold()] > 1:
                reasons.append('repeated-name-distinct-source-records')
            if not contains_point(unit['geometry'], feature['geometry']['coordinates']):
                reasons.append('point-outside-referenced-unit')
            if len(occupants) > 1:
                reasons.append('multiple-occupants-reference-unit')
            result[p['occupant_id']] = {'unitName': unit['properties'].get('unit_name_en'),
                                        'reasons': reasons, 'sourceLink': 'explicit-unit-id',
                                        'identityAction': 'review-existing-establishment'}
    return result


def build_plan(root=ROOT):
    """Describe premises, physical members and unlinked occupants without assigning canonical IDs."""
    catalogue = json.loads((root / 'src/lib/routing/mtr-catalog.json').read_text())
    premises, units, memberships, occupants = [], [], [], []
    for station in catalogue['stations']:
        # These are plan references, not SaanSeoi IDs or assertions of existing Location identity.
        station_ref = 'mtr-station:' + station['id']
        premises.append({
            'ref': station_ref, 'stationCode': station['id'],
            'entityKind': 'built', 'class': 'premises',
            'names': {'en': station['name'], 'zh-Hant': station['nameZh']},
            'source': {'name': catalogue['source'], 'sha256': catalogue['sourceSha256']},
            'geometry': {'type': 'Point', 'coordinates': station['coordinates']},
        })
        if station['id'] not in SNAPSHOTS:
            continue
        directory = root / '.research/indoor' / SNAPSHOTS[station['id']]
        manifest, layers = read_snapshot(directory)
        venues = indexed(layers['venue_polygon'], 'venue_id')
        if len(venues) != 1:
            raise ValueError('Expected one station venue')
        premises[-1]['indoorSource'] = {'manifest': manifest, 'venue': venues[manifest['venueId']]}
        levels = indexed(layers['level_polygon'], 'level_id')
        source_units = indexed(layers['unit_polygon'], 'unit_id')
        for unit_id, feature in source_units.items():
            p = feature['properties']
            level = levels[p['level_id']]['properties']
            unit_ref = 'landsd-mtr-unit:' + unit_id
            units.append({
                'ref': unit_ref, 'entityKind': 'built', 'class': 'building_part',
                'names': source_names(p, 'unit'), 'sourceUnitId': unit_id,
                'sourceVenueId': manifest['venueId'], 'retrievedAt': manifest['retrievedAt'],
                'floor': {'sourceId': p['level_id'], 'names': source_names(level, 'level'),
                          'shortName': level.get('level_short_name_en'),
                          'ordinal': level.get('level_ordinal')},
                'section': {'sourceId': p.get('section_id'), 'names': source_names(p, 'section')},
                'rawSource': feature,
            })
            memberships.append({'table': 'locationMembership', 'childRef': unit_ref,
                                'parentRef': station_ref, 'sourceUnitId': unit_id})
        audit = audit_occupants(layers)
        for occupant_id, feature in indexed(layers['occupant_point'], 'occupant_id').items():
            p = feature['properties']
            if p['unit_id'] not in source_units:
                raise ValueError('Occupant references unknown unit')
            if p['level_id'] != source_units[p['unit_id']]['properties']['level_id']:
                raise ValueError('Occupant level differs from its unit')
            # Source occupancy is evidence; matching a real establishment remains an explicit step.
            occupants.append({'sourceOccupantId': occupant_id,
                              'unitRef': 'landsd-mtr-unit:' + p['unit_id'],
                              'names': source_names(p, 'occupant'), 'rawSource': feature,
                              'establishmentLocationId': None, 'status': 'needs-identity-review',
                              'review': audit[occupant_id]})
    return {'version': 1, 'status': 'plan-only', 'premises': premises, 'units': units,
            'memberships': memberships, 'occupantEvidence': occupants}


def main():
    """Write a new review artifact; refuse to replace an existing plan."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    plan = build_plan()
    with args.output.open('x') as output:
        json.dump(plan, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({key: len(plan[key]) for key in
                      ['premises', 'units', 'memberships', 'occupantEvidence']}))


if __name__ == '__main__':
    main()
