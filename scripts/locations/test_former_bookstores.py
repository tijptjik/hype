"""Rehearse the whole-layer bookstore migration on a disposable database copy.

Usage: dev-check python scripts/locations/test_former_bookstores.py SOURCE.sqlite OUTPUT.sqlite
The source is opened read-only. No live database is changed.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'migrations/0207_former_bookstore_occupancy.sql'
FIXTURE = Path(__file__).with_name('fixtures') / 'former-bookstores.json'


def apply(db):
    """Execute all statements under a single rollback-capable transaction."""
    statement = ''
    with db:
        db.execute('BEGIN')
        for line in MIGRATION.read_text().splitlines(True):
            statement += line
            if sqlite3.complete_statement(statement):
                db.execute(statement)
                statement = ''
        assert not statement.strip()


def dump(db):
    """Capture logical data and schema, excluding connection-local state."""
    return '\n'.join(db.iterdump())


def main():
    """Verify idempotency, immutable history, unrelated records and stale-input rejection."""
    source, output = map(Path, sys.argv[1:])
    if source.resolve() == output.resolve() or output.exists():
        raise ValueError('Output must be a new disposable database')
    before = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
    db = sqlite3.connect(output)
    before.backup(db)
    db.execute('PRAGMA foreign_keys=ON')
    assert not list(db.execute('PRAGMA foreign_key_check'))
    rows = json.loads(FIXTURE.read_text())['records']
    targets = {r['featureId'] for r in rows}
    count = len(targets)
    matched = sum(row['building'] is not None for row in rows)
    layer = json.loads(FIXTURE.read_text())['layerId']
    assert {r[0] for r in db.execute('SELECT id FROM feature WHERE layerId=?', (layer,))} - set(json.loads(FIXTURE.read_text()).get('excludedFeatureIds', [])) == targets, 'Fixture omits layer members'
    old_features = {r[0]: r for r in db.execute('SELECT * FROM feature')}
    old_revisions = list(db.execute('SELECT * FROM featureRevision'))
    old_other = {table: list(db.execute(f'SELECT * FROM {table}')) for table in ['image','featureProperty','featurePropertyI18n','layer','project']}
    preserved = {}
    for fixture_row in rows:
        state = fixture_row.get('reviewedCurrentState')
        fid = fixture_row['featureId']
        current = db.execute('SELECT geometry,addressMeta FROM feature WHERE id=?', (fid,)).fetchone()
        if state and json.loads(current[1]) == state['addressMeta']:
            preserved[fid] = (current, list(db.execute('SELECT * FROM featureI18n WHERE featureId=? ORDER BY locale', (fid,))))
    apply(db)
    for fid, (placement, translations) in preserved.items():
        assert db.execute('SELECT geometry,addressMeta FROM feature WHERE id=?', (fid,)).fetchone() == placement
        assert list(db.execute('SELECT * FROM featureI18n WHERE featureId=? ORDER BY locale', (fid,))) == translations
        assert json.loads(db.execute('SELECT acceptedGeometry FROM featureLocation WHERE featureId=?', (fid,)).fetchone()[0]) == json.loads(placement[0])
    assert not list(db.execute('PRAGMA foreign_key_check'))
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert db.execute("SELECT count(*) FROM location WHERE id LIKE 'former-bookstore:%'").fetchone()[0] == count
    assert db.execute("SELECT count(*) FROM locationOccupancy WHERE id LIKE 'former-bookstore:%' AND occupancyState='former' AND effectiveFrom IS NULL AND effectiveTo IS NULL").fetchone()[0] == count
    assert db.execute("SELECT count(*) FROM locationOccupancy WHERE id LIKE 'former-bookstore:%' AND containerLocationId IS NOT NULL").fetchone()[0] == matched
    for row in db.execute('SELECT * FROM feature'):
        if row[0] not in targets:
            assert row == old_features[row[0]]
    for table, values in old_other.items():
        assert list(db.execute(f'SELECT * FROM {table}')) == values, table
    now_revisions = {r[0]: r for r in db.execute('SELECT * FROM featureRevision')}
    assert all(now_revisions[r[0]] == r for r in old_revisions)
    for fid in targets:
        row = db.execute('SELECT f.isIntangible,f.geometry,r.content FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.id=?',(fid,)).fetchone()
        content = json.loads(row[2])
        assert row[0] == 1 and content['profile']['isIntangible'] is True
        assert json.loads(row[1]) == content['placement']['geometry']
        assert content['placement']['location']['occupancyRevisionId']
        assert len(content['placement']['location']['memberships']) == db.execute('SELECT count(*) FROM featureLocationMembership WHERE featureId=?',(fid,)).fetchone()[0]
    first = dump(db)
    apply(db)
    assert dump(db) == first, 'Second run changed the database'
    # Failure midway must roll back the whole batch, including inserted buildings.
    stale = sqlite3.connect(':memory:')
    before.backup(stale)
    stale.execute('PRAGMA foreign_keys=ON')
    stale.execute("INSERT INTO location(id,kind,ownerOrganisationId,state) VALUES('former-bookstore:8Blj7NBdhCzc','establishment','kXCT_5XMH1Nj','unresolved')")
    stale.commit()
    stale_before = dump(stale)
    try:
        apply(stale)
        raise AssertionError('Conflicting identity was accepted')
    except sqlite3.IntegrityError:
        assert dump(stale) == stale_before, 'Failed migration left partial writes'
    # Source drift is rejected before any inserts; existing reviewed buildings are reusable.
    drift = sqlite3.connect(':memory:')
    before.backup(drift)
    drift.execute('PRAGMA foreign_keys=ON')
    drift.execute("INSERT INTO featureRevisionWriteScope VALUES('BMBJEblJ6UrI','test')")
    drift.execute("UPDATE featureI18n SET title='Concurrent title edit' WHERE featureId='BMBJEblJ6UrI' AND locale='en'")
    drift.commit()
    drift_before = dump(drift)
    try:
        apply(drift)
        raise AssertionError('Changed source was accepted')
    except sqlite3.IntegrityError:
        assert dump(drift) == drift_before
    reused = sqlite3.connect(':memory:')
    before.backup(reused)
    reused.execute('PRAGMA foreign_keys=ON')
    building = db.execute("SELECT * FROM location WHERE id=(SELECT containerLocationId FROM locationOccupancy WHERE id='former-bookstore:BMBJEblJ6UrI:occupancy:v1')").fetchone()
    reused.execute('INSERT INTO location VALUES(' + ','.join('?' for _ in building) + ')', building)
    baseline = db.execute('SELECT * FROM locationRevision WHERE locationId=?',(building[0],)).fetchone()
    reused.execute('INSERT INTO locationRevision VALUES(' + ','.join('?' for _ in baseline) + ')', baseline)
    reused.commit()
    apply(reused)
    assert reused.execute('SELECT count(*) FROM locationRevision WHERE locationId=?',(building[0],)).fetchone()[0] == 1
    assert not list(reused.execute('PRAGMA foreign_key_check'))
    # A changed layer cohort and a stale pilot receipt must never silently skip records.
    for case in ['cohort', 'pilot-receipt']:
        changed = sqlite3.connect(':memory:')
        before.backup(changed)
        changed.execute('PRAGMA foreign_keys=ON')
        if case == 'cohort':
            sample = changed.execute("SELECT * FROM feature WHERE id='BMBJEblJ6UrI'").fetchone()
            columns = [r[1] for r in changed.execute('PRAGMA table_info(feature)')]
            values = dict(zip(columns, sample))
            values.update(id='bookstore-cohort-drift', currentRevisionId=None, revisionVersion=0)
            changed.execute('INSERT INTO feature (' + ','.join(values) + ') VALUES(' + ','.join('?' for _ in values) + ')', list(values.values()))
        else:
            changed.execute("INSERT INTO revisionChangeSet(id,actorId,origin,createdAt) VALUES('0207_former_bookstore_occupancy','test','migration','2026-11-09T00:00:00.000Z')")
        changed.commit()
        changed_before = dump(changed)
        try:
            apply(changed)
            raise AssertionError(case + ' was accepted')
        except sqlite3.IntegrityError:
            assert dump(changed) == changed_before
    print(json.dumps({'establishments':count,'formerOccupancies':count,'matchedBuildings':matched,'unresolvedBuildings':count-matched,'idempotent':True,'historyPreserved':True,'unrelatedDataPreserved':True,'collisionRolledBack':True,'staleSourceRejected':True,'existingBuildingReused':True,'cohortDriftRejected':True,'pilotReceiptRejected':True,'integrity':'ok','output':str(output)}))
    before.close()
    db.close()


if __name__ == '__main__':
    main()
