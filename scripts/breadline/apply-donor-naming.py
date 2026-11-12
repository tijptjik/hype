"""Validate a reviewed donor naming migration on a copy; apply only with --apply."""
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import sqlite3


def fingerprint(db, query):
    """Hash ordered source rows without exporting private source contents."""
    return hashlib.sha256(json.dumps(db.execute(query).fetchall(), ensure_ascii=False).encode()).hexdigest()


def apply(db, migration):
    """Execute the generated snapshot-fenced transaction and roll back any failed guard."""
    db.execute('PRAGMA foreign_keys=ON')
    try:
        db.executescript(migration)
    except Exception:
        db.rollback()
        raise


def verify(db, review):
    """Check every generated title and accepted snapshot, plus foreign-key integrity."""
    policy = review['layerPolicy']
    actual_policy = db.execute('SELECT namingRules,version FROM featureIntentPolicy WHERE scopeType=? AND scopeId=?',
                               (policy['scopeType'], policy['scopeId'])).fetchone()
    if not actual_policy or json.loads(actual_policy[0]) != policy['namingRules'] or actual_policy[1] != policy['version']:
        raise RuntimeError('Future donor naming policy does not match the reviewed template')
    for row in review['rows']:
        actual = db.execute('SELECT title FROM featureI18n WHERE featureId=? AND locale=?', (row['featureId'], row['locale'])).fetchone()
        if not actual or actual[0] != row['after']:
            raise RuntimeError(f"Projection mismatch: {row['featureId']} {row['locale']}: {actual}")
    for row in review['excluded']:
        for locale, title in row['names'].items():
            actual = db.execute('SELECT title FROM featureI18n WHERE featureId=? AND locale=?', (row['id'], locale)).fetchone()
            if not actual or actual[0] != title:
                raise RuntimeError(f"Excluded record changed: {row['id']}")
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise RuntimeError('Foreign-key validation failed')
    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('Database integrity validation failed')
    if db.execute('SELECT count(*) FROM featureRevisionWriteScope').fetchone()[0]:
        raise RuntimeError('Unclosed Feature revision write scopes')
    mismatches = db.execute("""SELECT f.id FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId
      WHERE r.changeSetId='breadline-donor-naming:v1' AND
      (json_extract(r.content,'$.placement.addressMeta') IS NOT json(f.addressMeta)
       OR json_extract(r.content,'$.placement.location.acceptancePolicy') IS NOT
         (SELECT json(acceptancePolicy) FROM featureLocation WHERE featureId=f.id)
       OR f.revisionVersion!=r.sequence)""").fetchall()
    if mismatches:
        raise RuntimeError(f'Accepted snapshot/projection mismatch: {mismatches}')


def dry_run(source, migration, review):
    """Prove exact output, retained sources and idempotence on an isolated SQLite copy."""
    with closing(sqlite3.connect(':memory:')) as db:
        source.backup(db)
        already_applied = bool(db.execute("SELECT 1 FROM revisionChangeSet WHERE id='breadline-donor-naming:v1'").fetchone())
        source_hash = fingerprint(db, 'SELECT * FROM locationRevision ORDER BY id')
        source_i18n_hash = fingerprint(db, 'SELECT * FROM locationRevisionI18n ORDER BY revisionId,locale')
        # Compare unrelated accepted content, not just the displayed title projection.
        originals = {row[0]: json.loads(row[1]) for row in db.execute(
            'SELECT f.id,r.content FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId')}
        apply(db, migration)
        verify(db, review)
        for feature_id in {row['featureId'] for row in review['rows']}:
            after = json.loads(db.execute('SELECT r.content FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.id=?', (feature_id,)).fetchone()[0])
            before = originals[feature_id]
            for content in [before, after]:
                content['profile'].pop('nameTemplate', None)
                content['placement']['addressMeta']['address'].pop('accessHints', None)
                content['placement']['location'].pop('acceptancePolicy', None)
                content['placement']['location'].pop('associationVersion', None)
                content['properties'].pop('4ql4aG0vBWsc', None)
            if before != after:
                raise RuntimeError(f'Unrelated accepted content changed: {feature_id}')
        if fingerprint(db, 'SELECT * FROM locationRevision ORDER BY id') != source_hash:
            raise RuntimeError('Source revisions were modified')
        if fingerprint(db, 'SELECT * FROM locationRevisionI18n ORDER BY revisionId,locale') != source_i18n_hash:
            raise RuntimeError('Source translations were modified')
        counts = {table: db.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in
                  ['featureRevision', 'locationSharedRevision', 'identityCatalogueRevision', 'displayTemplateRevision', 'featureIntentPolicyRevision']}
        first = fingerprint(db, 'SELECT * FROM featureI18n ORDER BY featureId,locale')
        apply(db, migration)
        verify(db, review)
        if first != fingerprint(db, 'SELECT * FROM featureI18n ORDER BY featureId,locale'):
            raise RuntimeError('Replay changed generated names')
        if counts != {table: db.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in counts}:
            raise RuntimeError('Replay appended extra history')
        if not already_applied:
            # A changed prerequisite must reject the entire transaction without appending history.
            with closing(sqlite3.connect(':memory:')) as stale:
                source.backup(stale)
                # Simulate a reviewed component expectation that no longer matches the database.
                stale_migration = migration.replace("component='ToggleField'", "component='TextField'", 1)
                if stale_migration == migration:
                    raise RuntimeError('Missing prerequisite guard fixture')
                original_count = stale.execute('SELECT count(*) FROM featureRevision').fetchone()[0]
                try:
                    apply(stale, stale_migration)
                except sqlite3.IntegrityError:
                    pass
                else:
                    raise RuntimeError('Stale prerequisite was accepted')
                if stale.execute('SELECT count(*) FROM featureRevision').fetchone()[0] != original_count:
                    raise RuntimeError('Rejected migration appended history')
                if stale.execute("SELECT 1 FROM revisionChangeSet WHERE id='breadline-donor-naming:v1'").fetchone():
                    raise RuntimeError('Rejected migration retained a changeset')
        return {'donors': review['donors'], 'verifiedNames': len(review['rows']), 'excludedRecords': len(review['excluded']),
                'sourcePreserved': True, 'unrelatedContentPreserved': True, 'staleGuardRollback': 'previously applied' if already_applied else True,
                'idempotent': True, 'foreignKeys': 'passed', 'integrity': 'passed'}


def main():
    """Default to validation only; explicit apply creates a backup and repeats stale guards."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--migration', required=True, type=Path)
    parser.add_argument('--review', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    migration = args.migration.read_text()
    review = json.loads(args.review.read_text())
    source = args.database.resolve(strict=True)
    with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)) as db:
        result = dry_run(db, migration, review)
    result['mode'] = 'dry-run'
    if args.apply:
        backup = source.with_name(source.name + '.before-donor-naming-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        with closing(sqlite3.connect(source)) as db, closing(sqlite3.connect(backup)) as saved:
            db.backup(saved)
            apply(db, migration)
            verify(db, review)
        result.update(mode='applied', backup=str(backup))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
