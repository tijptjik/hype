#!/usr/bin/env python3
"""Export local Farm the City data and rehearse (never apply) its deletion migration."""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ORG = 'kP31z2fP4-k2'
MIGRATION = Path('migrations/0099_offboard_farmthecity.sql')


def quote(value):
    """Quote a SQLite text literal for generated, reviewable SQL."""
    return "'" + value.replace("'", "''") + "'"


def prepare(source, output):
    """Read a consistent snapshot, export scoped rows, and validate deletion in memory."""
    output.mkdir(parents=True, exist_ok=False)
    source_db = sqlite3.connect(f'file:{source.resolve()}?mode=ro', uri=True)
    db = sqlite3.connect(':memory:')
    source_db.backup(db)
    source_db.close()
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    assert db.execute('SELECT code FROM organisation WHERE id=?', (ORG,)).fetchone()[0] == 'farmthecity'

    # Include denormalised ownership and translations even where no FK exists.
    predicates = {'organisation': f'id={quote(ORG)}'}
    for table, column, parent in [('project', 'organisationId', 'organisation'),
                                  ('layer', 'projectId', 'project'),
                                  ('feature', 'layerId', 'layer')]:
        predicates[table] = f'organisationId={quote(ORG)} OR {column} IN (SELECT id FROM {parent} WHERE {predicates[parent]})'
    tables = {r['name']: r['sql'] for r in db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'featureSearchFts%'")}
    cols = {t: [r['name'] for r in db.execute(f'PRAGMA table_info("{t}")')] for t in tables}
    for table in tables:
        if table in predicates:
            continue
        terms = []
        for column, parent in [('organisationId', 'organisation'), ('projectId', 'project'), ('layerId', 'layer'), ('featureId', 'feature')]:
            if column in cols[table]:
                terms.append(f'"{column}" IN (SELECT id FROM "{parent}" WHERE {predicates[parent]})')
        if terms:
            predicates[table] = ' OR '.join(terms)
    # These resources require a separate shared-resource ownership decision if introduced.
    for table in ['mapStyles']:
        assert db.execute(f'SELECT count(*) FROM "{table}" WHERE {predicates[table]}').fetchone()[0] == 0, f'Review owned {table} before offboarding'
    for table in tables:
        if 'taskId' in cols[table]:
            predicates[table] = f'taskId IN (SELECT id FROM task WHERE {predicates["task"]})'
    # Refuse property links from unrelated resources before cascading owned definitions.
    external_guards = []
    for table in tables:
        if 'propertyId' not in cols[table]:
            continue
        owned = f'propertyId IN (SELECT id FROM property WHERE {predicates["property"]})'
        if table in predicates:
            guard = f'NOT EXISTS (SELECT 1 FROM "{table}" WHERE ({owned}) AND NOT ({predicates[table]}))'
            assert db.execute('SELECT ' + guard).fetchone()[0], f'Shared owned property: {table}'
            external_guards.append(guard)
        else:
            predicates[table] = owned
    predicates['propertyValueI18n'] = f'propertyValueId IN (SELECT id FROM propertyValue WHERE {predicates["propertyValue"]})'
    scoped = {t: [dict(r) for r in db.execute(f'SELECT * FROM "{t}" WHERE {p}')] for t, p in predicates.items()}
    # Preserve shared image/property/map metadata as reference material, without deleting it.
    refs = {}
    for target, key in [('image', 'imageId'), ('property', 'propertyId'), ('mapStyles', 'mapStyleId')]:
        ids = {r[key] for rows in scoped.values() for r in rows if r.get(key) is not None}
        refs[target] = [dict(r) for r in db.execute(f'SELECT * FROM "{target}"') if r['id'] in ids and r['id'] not in {x.get('id') for x in scoped.get(target, [])}]
    property_ids = {r['id'] for r in refs['property']}
    refs['propertyValue'] = [dict(r) for r in db.execute('SELECT * FROM propertyValue') if r['propertyId'] in property_ids]
    for t, key, ids in [('propertyI18n', 'propertyId', property_ids), ('propertyValueI18n', 'propertyValueId', {r['id'] for r in refs['propertyValue']}), ('mapStyleI18n', 'mapStyleId', {r['id'] for r in refs['mapStyles']})]:
        refs[t] = [dict(r) for r in db.execute(f'SELECT * FROM "{t}"') if r[key] in ids]
    payload = {'source': str(source.resolve()), 'exportedAt': datetime.now(timezone.utc).isoformat(), 'organisationId': ORG, 'tables': scoped, 'retainedReferences': refs}
    (output / 'data.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    geo = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'id': r['id'], 'geometry': json.loads(r['geometry']) if r['geometry'] else None, 'properties': {k: v for k, v in r.items() if k != 'geometry'}} for r in scoped['feature']]}
    (output / 'features.geojson').write_text(json.dumps(geo, ensure_ascii=False) + '\n')
    # The standalone archive uses unconstrained tables so it opens without unrelated accounts.
    archive = sqlite3.connect(output / 'data.sqlite')
    for table, rows in {**scoped, **{t: scoped.get(t, []) + rows for t, rows in refs.items()}}.items():
        columns = cols[table]
        archive.execute(f'CREATE TABLE "{table}" (' + ','.join(f'"{c}"' for c in columns) + ')')
        archive.executemany(f'INSERT INTO "{table}" VALUES (' + ','.join('?' for _ in columns) + ')', [[r[c] for c in columns] for r in rows])
    archive.commit()
    assert archive.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    archive.close()

    # Fail closed on changed ownership, added records, or changed identities before any delete.
    lines = ['-- Farm the City offboarding. Prepared from the local database; application is tracked in d1_migrations.',
             '-- Export and revalidate the destination before applying in another environment.',
             '-- Run through D1 migrations (atomic transaction), never statement-by-statement.',
             '-- Shared users, images, global property definitions and object-storage files are retained.',
             'CREATE TABLE _farmthecity_guard (ok INTEGER NOT NULL CHECK (ok=1));']
    guards = external_guards + [f"EXISTS (SELECT 1 FROM organisation WHERE id={quote(ORG)} AND code='farmthecity')"]
    for table, predicate in predicates.items():
        # Derived state can change between environments and while refresh workers run.
        if table in ['featureDivisionMembership', 'featureDivisionJob', 'featureCountRollup', 'featureMtrJob']:
            continue
        operator = '<=' if table in ['projectProperty', 'hubLayer'] else '='
        guards.append(f'(SELECT count(*) FROM "{table}" WHERE {predicate}){operator}{len(scoped[table])}')
    for table in ['project', 'layer', 'feature']:
        ids = ','.join(quote(r['id']) for r in scoped[table])
        guards.append(f'NOT EXISTS (SELECT 1 FROM "{table}" WHERE ({predicates[table]}) AND id NOT IN ({ids}))')
    for guard in guards:
        lines.append(f'INSERT INTO _farmthecity_guard SELECT CASE WHEN {guard} THEN 1 ELSE 0 END;')
    lines.extend(['-- Translation tables lack parent foreign keys in the current schema.',
                  f'DELETE FROM featureI18n WHERE {predicates["featureI18n"]};',
                  f'DELETE FROM layerI18n WHERE {predicates["layerI18n"]};',
                  '-- Cascades remove owned resources, roles, assignments, jobs and search documents.',
                  '-- Feature-count triggers decrement rollups and invalidate cached counts.',
                  f'DELETE FROM organisation WHERE id={quote(ORG)} AND code=\'farmthecity\';',
                  'DROP TABLE _farmthecity_guard;'])
    sql = '\n'.join(lines) + '\n'
    # Compare every ordinary table, not just headline counts, to detect collateral changes.
    before = {t: sorted((tuple(r) for r in db.execute(f'SELECT * FROM "{t}"')), key=repr) for t in tables}
    fts_before = dict(db.execute('SELECT rowid,grams FROM featureSearchFts'))
    db.executescript('BEGIN;\n' + sql)
    removed_search_ids = {r['id'] for r in scoped['featureSearchDocument']}
    assert dict(db.execute('SELECT rowid,grams FROM featureSearchFts')) == {k: v for k, v in fts_before.items() if k not in removed_search_ids}
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    changed = []
    for table in tables:
        after = sorted((tuple(r) for r in db.execute(f'SELECT * FROM "{table}"')), key=repr)
        removed = {tuple(r[c] for c in cols[table]) for r in scoped.get(table, [])}
        expected = [r for r in before[table] if r not in removed]
        if after != before[table]:
            changed.append(table)
        if table not in ['featureCountRevision', 'featureCountUserRevision']:
            assert after == expected, f'Unexpected changes or remaining scoped rows: {table}'
    db.rollback()
    # An unexpected new feature must abort before deleting anything.
    db.execute("UPDATE organisation SET code='farmthecity-renamed' WHERE id=?", (ORG,))
    db.commit()
    try:
        db.executescript('BEGIN;\n' + sql)
        raise AssertionError('Identity guard did not abort')
    except sqlite3.IntegrityError:
        db.rollback()
    assert db.execute('SELECT count(*) FROM feature WHERE organisationId=?', (ORG,)).fetchone()[0] == len(scoped['feature'])
    # A new translation is unexported data and must fail the scope-count guard.
    db.execute("UPDATE organisation SET code='farmthecity' WHERE id=?", (ORG,))
    db.execute("INSERT INTO layerI18n SELECT layerId,'zz-test'," + ','.join('"' + c + '"' for c in cols['layerI18n'][2:]) + " FROM layerI18n WHERE layerId=? LIMIT 1", (scoped['layer'][0]['id'],))
    db.commit()
    try:
        db.executescript('BEGIN;\n' + sql)
        raise AssertionError('Scope-count guard did not abort')
    except sqlite3.IntegrityError:
        db.rollback()
    assert db.execute('SELECT count(*) FROM feature WHERE organisationId=?', (ORG,)).fetchone()[0] == len(scoped['feature'])
    MIGRATION.write_text(sql)
    report = {'counts': {t: len(rows) for t, rows in scoped.items() if rows}, 'referenceCounts': {t: len(rows) for t, rows in refs.items() if rows}, 'changedTables': changed, 'foreignKeyCheck': 'passed', 'integrityCheck': 'passed', 'unrelatedRowsUnchanged': True, 'identityGuard': 'passed', 'scopeCountGuard': 'passed', 'searchIndexCheck': 'passed', 'appliedToSource': False}
    (output / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(output.iterdir()) if p.is_file()))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source, args.output)
