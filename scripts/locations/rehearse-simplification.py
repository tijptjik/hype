#!/usr/bin/env python3
"""Rehearse Places consolidation on a fresh copy; never mutate the input. Refs #194."""
from collections import Counter
import argparse
import json
import pathlib
import sqlite3

MIGRATIONS = [
    '0122_simplify_place_refresh.sql',
    '0123_place_owned_fields.sql',
    '0124_place_adoption_decisions.sql',
    '0125_place_identity_consolidation.sql',
]
TABLES = {
    'place', 'placeRevision', 'featurePlace', 'featurePlaceHistory',
    'placeIdentityHistory', 'placeIdentityReview', 'placeAdoptionProposal',
    'placeRefresh', 'placeRefreshItem',
}
RETIRED = {
    'projectPlacePolicy', 'featurePlaceDetached', 'placeRedirect', 'placeMergeReview',
    'placeIdentityRejection', 'placeAdoptionDecision', 'placeRefreshFeature',
    'placeSourceTransition', 'placeSourceComparison', 'placeSourcePage', 'placeSourceEvidenceId',
}


def rows(db, table):
    """Read trusted table rows as dictionaries for exact semantic comparison."""
    return [dict(row) for row in db.execute(f'SELECT * FROM "{table}" ORDER BY rowid')]


def verify(before, after):
    """Check every retained column and every moved record, including immutable evidence."""
    before.row_factory = after.row_factory = sqlite3.Row
    tables = {r[0] for r in before.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for table in tables - RETIRED - {'d1_migrations', 'sqlite_sequence'}:
        columns = [r[1] for r in before.execute(f'PRAGMA table_info("{table}")')]
        projection = ','.join(f'"{column}"' for column in columns)
        # Addition of owned columns must not change any pre-existing column, in any table.
        assert Counter(tuple(r) for r in before.execute(f'SELECT {projection} FROM "{table}"')) == Counter(
            tuple(r) for r in after.execute(f'SELECT {projection} FROM "{table}"')
        ), f'Existing columns changed: {table}'
    for row in rows(before, 'projectPlacePolicy'):
        actual = after.execute('SELECT placePolicy,placePolicyRevision FROM project WHERE id=?', (row['projectId'],)).fetchone()
        assert json.loads(actual[0]) == json.loads(row['policy']) and actual[1] == row['revision']
    for row in rows(before, 'featurePlaceDetached'):
        actual = json.loads(after.execute('SELECT localPlaceBrands FROM feature WHERE id=?', (row['featureId'],)).fetchone()[0])
        expected = {k: v for k, v in row.items() if k != 'featureId'}
        expected['brands'] = json.loads(expected['brands'])
        assert actual == expected
    for row in rows(before, 'placeAdoptionDecision'):
        actual = after.execute(f"SELECT {row['fieldGroup']}Decision FROM placeAdoptionProposal WHERE id=?", (row['proposalId'],)).fetchone()[0]
        assert json.loads(actual) == row
    for row in rows(before, 'placeIdentityRejection'):
        actual = after.execute('SELECT rejection FROM placeIdentityReview WHERE id=?', (row['reviewId'],)).fetchone()[0]
        assert json.loads(actual) == row
    for row in rows(before, 'placeMergeReview'):
        actual = json.loads(after.execute('SELECT mergeReviews FROM placeIdentityReview WHERE id=?', (row['identityReviewId'],)).fetchone()[0])
        expected = dict(row)
        for key in ('targetBaseline', 'sourceBaseline'):
            expected[key] = json.loads(expected[key])
        assert [value for value in actual if value['id'] == row['id']] == [expected]
    for row in rows(before, 'placeRedirect'):
        actual = after.execute('SELECT redirect,redirectTargetId FROM place WHERE id=?', (row['sourcePlaceId'],)).fetchone()
        assert json.loads(actual[0]) == row and actual[1] == row['targetPlaceId']
    for row in rows(before, 'placeRefreshFeature'):
        outcomes = json.loads(after.execute('SELECT outcomes FROM placeRefreshItem WHERE runId=? AND placeId=?', (row['runId'], row['placeId'])).fetchone()[0])
        assert outcomes[row['featureId']] == {k: v for k, v in row.items() if k not in ('runId', 'placeId', 'featureId')}
    existing = {r[0] for r in after.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert not existing & RETIRED and existing & TABLES == TABLES
    assert not list(after.execute("SELECT name FROM sqlite_master WHERE type='view' AND (name LIKE 'place%' OR name LIKE 'featurePlace%' OR name='projectPlacePolicy')"))
    assert not list(after.execute('PRAGMA foreign_key_check'))
    assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    return {'status': 'verified', 'tables': sorted(TABLES), 'preservedTables': len(tables - RETIRED),
            'convertedRecords': {table: len(rows(before, table)) for table in sorted(RETIRED) if table in tables}}


def main():
    """Back up an explicit local input, migrate the copy atomically, and write count-only evidence."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path, help='New directory under .local/places')
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
    # executescript is one explicit transaction; a failed statement never advances the ledger.
    statements = ['BEGIN IMMEDIATE;']
    for name in MIGRATIONS:
        statements.append((pathlib.Path('migrations') / name).read_text())
        statements.append(f"INSERT INTO d1_migrations(name) VALUES('{name}');")
    statements.append('COMMIT;')
    try:
        after.executescript('\n'.join(statements))
        receipt = verify(before, after)
        receipt['migrations'] = MIGRATIONS
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))
    finally:
        before.close()
        after.close()


if __name__ == '__main__':
    main()
