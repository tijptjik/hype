#!/usr/bin/env python3
"""Refs #194: audit local A-Z starting data and generate private review links, read-only."""
import argparse
import importlib.util
import json
import sqlite3
from pathlib import Path
from urllib.parse import quote, urlsplit

spec = importlib.util.spec_from_file_location('lifecycle_seed', Path(__file__).with_name('seed-lifecycle.py'))
seed_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed_module)

# These are starting-state assertions, never evidence that a move workflow executed.
CHECKS = {
    'A': ("SELECT kind='unknown' FROM location WHERE id=?||'-shop'", 'Unknown kind is retained'),
    'B': ("SELECT count(*)=2 FROM locationRevision WHERE locationId=?||'-shop'", 'Two fact versions retain one identity'),
    'C': ("SELECT count(*)=2 FROM location WHERE id IN (?||'-shop',?||'-destination') AND kind='establishment'", 'Branches have distinct establishment IDs'),
    'D': ("SELECT count(DISTINCT json_extract(facts,'$.details.operatingStatus'))=2 FROM locationRevision WHERE locationId=?||'-shop'", 'Closure and reopening versions are retained'),
    'E': ("SELECT json_extract(facts,'$.details.operatingStatus')='permanently_closed' FROM locationRevision WHERE id=?||'-shop-r1'", 'Closed establishment is retained'),
    'F': ("SELECT count(*)=2 FROM locationTransitionParticipant WHERE transitionRevisionId=?||'-replacement'", 'Replacement retains both participants'),
    'G': ("SELECT locationId=?||'-shop' FROM featureLocation WHERE featureId=?||'-feature'", 'Feature is separate from business identity; sign operation still requires acceptance'),
    'H': ("SELECT count(*)=2 AND count(DISTINCT addressId)=1 FROM addressRevision WHERE id LIKE ?||'-address-r%'", 'Two content versions share one address identity'),
    'I': ("SELECT count(DISTINCT addressId)=2 FROM addressRevision WHERE id LIKE ?||'-address-r%'", 'Separate addresses retain separate identities'),
    'J': ("SELECT scope='unit' AND json_extract(components,'$.unit.unitRef')='12' AND json_extract(components,'$.unit.unitType')='S' AND json_extract(components,'$.unit.floorRef')='1' FROM addressRevision WHERE id=?||'-address-r1'", 'Qualified unit address is present'),
    'K': ("SELECT addressRevisionId=?||'-address-r1' FROM featureLocation WHERE featureId=?||'-feature'", 'Accepted address remains pinned to first version'),
    'L': ("SELECT count(DISTINCT priority)=2 FROM locationAddressHead WHERE locationId=?||'-building'", 'Two ranked choices exist'),
    'M': ("SELECT count(*)=2 FROM locationMembershipHead WHERE relationshipId IN (?||'-member',?||'-outer-member')", 'Two levels of premises membership exist'),
    'N': ("SELECT count(DISTINCT relationshipId)=2 AND count(DISTINCT containerLocationId)=1 FROM locationOccupancyHead WHERE establishmentLocationId=?||'-shop'", 'Return is a distinct episode at the same container'),
    'O': ("SELECT occupancyRevisionId=?||'-occupancy' FROM featureLocation WHERE featureId=?||'-feature'", 'Old placement is retained; fixed execution is not demonstrated'),
    'P': ("SELECT occupancyState='unconfirmed' FROM locationOccupancyHead WHERE id=?||'-new-episode'", 'Unconfirmed destination awaits review'),
    'Q': ("SELECT occupancyState='current' AND verifiedAt IS NOT NULL FROM locationOccupancyHead WHERE id=?||'-new-episode'", 'Verified destination exists; automatic follow is not demonstrated'),
    'R': ("SELECT locationId=?||'-building' FROM featureLocation WHERE featureId=?||'-feature'", 'Feature directly associates to building'),
    'S': ("SELECT factsRevisionId=?||'-shop-r1' FROM featureLocation WHERE featureId=?||'-feature'", 'New facts have not silently replaced accepted facts'),
    'T': ("SELECT count(*)=1 FROM feature WHERE id=?||'-feature'", 'Review Feature exists; exact policy mapping remains a separate check'),
    'U': ("SELECT sourceAvailability='missing' FROM location WHERE id=?||'-shop'", 'Source omission retains identity'),
    'V': ("SELECT count(*)=2 AND count(DISTINCT assertionState)=2 FROM locationOccupancyHead WHERE relationshipId=?||'-occupancy'", 'Scoped suppression coexists with shared assertion'),
    'W': ("SELECT count(DISTINCT occupancyState)=2 FROM locationOccupancyHead WHERE establishmentLocationId=?||'-shop'", 'Former and current episodes coexist'),
    'X': ("SELECT NOT EXISTS(SELECT 1 FROM featureLocation WHERE featureId=?||'-feature') AND EXISTS(SELECT 1 FROM featureLocationHistory WHERE featureId=?||'-feature')", 'Unlinked Feature retains accepted history'),
    'Y': ("SELECT count(*)=4 FROM location WHERE id LIKE ?||'-%' AND state='manual' AND ownerOrganisationId IS NOT NULL", 'Private endpoints have an explicit owner'),
    'Z': ("SELECT count(*)=1 FROM locationOccupancy WHERE id=?||'-occupancy'", 'Stable episode ID exists for replay testing'),
}


def audit(db, base_url):
    """Check all fixtures and return links scoped to their actual persisted Organisation."""
    results = []
    for code, title in seed_module.SCENARIOS.items():
        prefix = 'lifecycle-demo-' + code.lower()
        feature = db.execute('SELECT organisationId,projectId,layerId,isPublished FROM feature WHERE id=?', (prefix+'-feature',)).fetchone()
        sql, expected = CHECKS[code]
        row = db.execute(sql, (prefix,) * sql.count('?')).fetchone()
        locations = db.execute('SELECT count(*) FROM location WHERE id IN (?,?,?,?)', tuple(prefix+'-'+role for role in ['shop','building','premises','destination'])).fetchone()[0]
        scope = '?organisation=' + quote(feature[0], safe='') if feature else ''
        links = {role: base_url + '/admin/' + ('features/' if role == 'feature' else 'locations/') + prefix + '-' + role + scope + ('#location' if role == 'feature' else '') for role in ['feature','shop','building','premises','destination']}
        results.append({'code':code, 'title':title, 'fixturePassed': bool(feature and feature[3] == 0 and locations == 4 and row and row[0]), 'expectedStartingState':expected, 'workflowAcceptance':'not executed by this fixture audit', 'links':links})
    return {'fixturePassed':all(row['fixturePassed'] for row in results), 'scenarios':results}


def markdown(report):
    """Render a review catalogue without confusing seeded state with executed acceptance."""
    lines = ['# Local Location lifecycle review', '', 'Synthetic, unpublished starting data. A passing fixture audit does **not** prove lifecycle workflow acceptance.', '', 'Use the Location links for relationships and the Feature links for accepted placement. Organisation context is included for private records.', '', '| Case | Inspect | Expected starting state | Fixture audit |', '| --- | --- | --- | --- |']
    for row in report['scenarios']:
        links = ' · '.join(f'[{role}]({url})' for role, url in row['links'].items())
        lines.append(f"| {row['code']} — {row['title']} | {links} | {row['expectedStartingState']} | {'Pass' if row['fixturePassed'] else 'FAIL'} |")
    return '\n'.join(lines)+'\n'


def main():
    """Require an existing local database and keep both database and service state unchanged."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--base-url', default='http://127.0.0.1:4174')
    parser.add_argument('--markdown', type=Path)
    args = parser.parse_args()
    path = args.db.resolve(strict=True)
    url = urlsplit(args.base_url)
    if path.suffix != '.sqlite' or url.scheme not in ('http','https') or url.hostname not in ('localhost','127.0.0.1','::1','hype.localhost') or url.query or url.fragment or url.path not in ('','/'):
        parser.error('Use an explicit local .sqlite file and a localhost origin')
    if args.markdown and args.markdown.resolve() == path:
        parser.error('The catalogue output cannot overwrite the database')
    with sqlite3.connect(f'file:{quote(str(path))}?mode=ro', uri=True) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        report = audit(db, args.base_url.rstrip('/'))
    if args.markdown:
        args.markdown.write_text(markdown(report))
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['fixturePassed'] else 1)


if __name__ == '__main__':
    main()
