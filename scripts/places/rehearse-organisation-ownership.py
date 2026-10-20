#!/usr/bin/env python3
"""Verify Organisation ownership conversion on a fresh local copy. Refs #194."""
from collections import Counter
import argparse
import json
import pathlib
import sqlite3

MIGRATION = '0135_place_organisation_ownership.sql'


def verify(before, after):
    """Check ownership mapping, retained evidence, all other rows and database invariants."""
    before.row_factory = after.row_factory = sqlite3.Row
    projects = {r['id']: r['organisationId'] for r in before.execute('SELECT id,organisationId FROM project')}
    def owner(project_id):
        return projects[project_id] if project_id is not None else None
    def baseline(value):
        result = json.loads(value) if isinstance(value, str) else dict(value)
        result['expectedOwnerOrganisationId'] = owner(result.pop('expectedOwnerProjectId', None))
        return result
    for old in before.execute('SELECT * FROM place'):
        expected = dict(old)
        expected['ownerOrganisationId'] = owner(expected.pop('ownerProjectId'))
        actual = dict(after.execute('SELECT * FROM place WHERE id=?', (old['id'],)).fetchone())
        assert actual == expected, f'Place changed beyond ownership: {old["id"]}'
    for old in before.execute('SELECT * FROM placeIdentityReview'):
        expected = dict(old)
        expected['ownerOrganisationId'] = owner(expected.pop('ownerProjectId'))
        expected['baseline'] = baseline(expected['baseline'])
        expected['mergeReviews'] = json.loads(expected['mergeReviews'])
        for merge in expected['mergeReviews']:
            merge['targetBaseline'] = baseline(merge['targetBaseline'])
            merge['sourceBaseline'] = baseline(merge['sourceBaseline'])
        actual = dict(after.execute('SELECT * FROM placeIdentityReview WHERE id=?', (old['id'],)).fetchone())
        actual['baseline'] = json.loads(actual['baseline'])
        actual['mergeReviews'] = json.loads(actual['mergeReviews'])
        assert actual == expected, f'Review changed beyond ownership: {old["id"]}'
    tables = [r[0] for r in before.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    for table in set(tables) - {'place', 'placeIdentityReview', 'd1_migrations', 'sqlite_sequence'}:
        assert Counter(tuple(r) for r in before.execute(f'SELECT * FROM "{table}"')) == Counter(
            tuple(r) for r in after.execute(f'SELECT * FROM "{table}"')), f'Changed table: {table}'
    assert not list(after.execute('PRAGMA foreign_key_check'))
    assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert list(after.execute("SELECT 1 FROM pragma_foreign_key_list('place') WHERE \"table\"='organisation' AND \"from\"='ownerOrganisationId'"))
    assert not list(after.execute("SELECT 1 FROM pragma_table_info('place') WHERE name='ownerProjectId'"))
    return {'status': 'verified', 'migration': MIGRATION,
            'places': after.execute('SELECT count(*) FROM place').fetchone()[0],
            'privatePlaces': after.execute('SELECT count(*) FROM place WHERE ownerOrganisationId IS NOT NULL').fetchone()[0],
            'reviews': after.execute('SELECT count(*) FROM placeIdentityReview').fetchone()[0],
            'otherTablesUnchanged': True, 'integrity': 'ok'}


def main():
    """Back up explicit local input, migrate only the copy, and retain count-only evidence."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    args = parser.parse_args()
    output = args.output.resolve()
    assert output.is_relative_to(pathlib.Path('.local/places').resolve()) and not output.exists()
    output.mkdir(parents=True, mode=0o700)
    source = sqlite3.connect(args.input.resolve().as_uri() + '?mode=ro', uri=True)
    before = sqlite3.connect(output / 'before.sqlite')
    source.backup(before)
    source.close()
    after = sqlite3.connect(output / 'result.sqlite')
    before.backup(after)
    after.execute('PRAGMA foreign_keys=ON')
    try:
        after.executescript('BEGIN IMMEDIATE;\n' + (pathlib.Path('migrations') / MIGRATION).read_text()
                           + f"\nINSERT INTO d1_migrations(name) VALUES('{MIGRATION}');\nCOMMIT;")
        receipt = verify(before, after)
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))
    finally:
        before.close()
        after.close()


if __name__ == '__main__':
    main()
