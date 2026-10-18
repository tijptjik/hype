"""Restore a reviewed local application snapshot without replacing authentication data."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3

# This allowlist deliberately excludes users, credentials, sessions and import ownership.
APPLICATION_TABLES = [
    'hub', 'image', 'hubI18n', 'organisation', 'organisationI18n',
    'project', 'projectI18n', 'layer', 'layerI18n', 'property', 'propertyI18n',
    'propertyValue', 'propertyValueI18n', 'layerProperty', 'projectProperty',
    'hubProperty', 'organisationProperty', 'projectMapStyles', 'hubLayer',
    'feature', 'featureI18n', 'featureProperty', 'featurePropertyI18n', 'featureImage',
    'task', 'taskImage', 'organisationRole', 'projectRole', 'hubRole',
    'divisionDefinition', 'divisionI18n', 'divisionRefresh', 'divisionRefreshChange',
    'featureDivisionMembership', 'featureDivisionJob', 'featureSpatial',
    'featureSearchDocument', 'featureCountEntry', 'featureCountRollup',
]
IDENTITY_TABLES = [
    'account', 'session', 'verification', 'passkey', 'userActivity',
    'breadlineImportUser', 'breadlineImportIdentity',
]


def quote(identifier):
    """Quote an identifier discovered from SQLite metadata or the fixed table allowlist."""
    return '"' + identifier.replace('"', '""') + '"'


def rows(db, table):
    """Read deterministic row values for exact restoration and preservation checks."""
    columns = [r[1] for r in db.execute(f'PRAGMA table_info({quote(table)})')]
    return columns, db.execute(f'SELECT * FROM {quote(table)} ORDER BY ' + ','.join(map(quote, columns))).fetchall()


def restore(target_path, snapshot_path):
    """Restore app tables transactionally, retaining existing identities and inert author references."""
    source = sqlite3.connect(snapshot_path.as_uri() + '?mode=ro', uri=True)
    target = sqlite3.connect(target_path, timeout=30)
    try:
        if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Application snapshot failed integrity')
        source.execute('BEGIN')
        original_users = {r[0]: r for r in target.execute('SELECT * FROM user')}
        original_identity = {table: rows(target, table) for table in IDENTITY_TABLES}
        # Personal application state needs a separate reviewed reconciliation if it references removed resources.
        personal = {table: rows(target, table) for table in ['userFeature', 'userLayer', 'hubUserState']}
        source_data = {table: rows(source, table) for table in APPLICATION_TABLES}
        # The old snapshot lacks this FK: retain orphan translations privately, never invent missing features.
        valid_features = {row[0] for row in source.execute('SELECT id FROM feature')}
        translation_columns, translations = source_data['featureI18n']
        feature_column = translation_columns.index('featureId')
        orphan_translations = [dict(zip(translation_columns, row)) for row in translations if row[feature_column] not in valid_features]
        source_data['featureI18n'] = (translation_columns, [row for row in translations if row[feature_column] in valid_features])
        for table, (columns, _) in source_data.items():
            if columns != rows(target, table)[0]:
                raise ValueError(f'Application schema differs: {table}')
        hub_ids = dict(target.execute('SELECT id,code FROM hub'))
        restored_hubs = dict(source.execute('SELECT code,id FROM hub'))
        org_ids = dict(target.execute('SELECT id,code FROM organisation'))
        restored_orgs = dict(source.execute('SELECT code,id FROM organisation'))
        triggers = target.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger'").fetchall()
        before = {table: len(rows(target, table)[1]) for table in ['organisation','project','layer','feature']}
        added_authors = []
        target.execute('PRAGMA foreign_keys=OFF')
        target.execute('BEGIN IMMEDIATE')
        try:
            # Historical publisher/contributor IDs remain attribution only, never restored sign-in identities.
            referenced_users = set()
            for table in APPLICATION_TABLES:
                for ref in source.execute(f'PRAGMA foreign_key_list({quote(table)})'):
                    if ref[2] == 'user':
                        referenced_users.update(r[0] for r in source.execute(
                            f'SELECT DISTINCT {quote(ref[3])} FROM {quote(table)} WHERE {quote(ref[3])} IS NOT NULL'))
            for user_id in sorted(referenced_users - original_users.keys()):
                author = source.execute('SELECT name,createdAt,updatedAt FROM user WHERE id=?', (user_id,)).fetchone()
                if not author:
                    raise ValueError('Snapshot has an unresolved historical author')
                target.execute('INSERT INTO user(id,name,email,telephone,emailVerified,isAnonymous,isArchived,createdAt,updatedAt) VALUES (?,?,NULL,NULL,0,0,1,?,?)',
                               (user_id, author[0], author[1], author[2]))
                added_authors.append(user_id)
            # Suppress derived-index triggers while replaying their exact snapshot rows.
            for name, _ in triggers:
                target.execute(f'DROP TRIGGER {quote(name)}')
            target.execute('DELETE FROM featureSearchFts')
            target.execute('DELETE FROM featureCountCache')
            for table in reversed(APPLICATION_TABLES):
                target.execute(f'DELETE FROM {quote(table)}')
            for table, (columns, records) in source_data.items():
                target.executemany(f'INSERT INTO {quote(table)} ({",".join(map(quote, columns))}) VALUES ({",".join("?" for _ in columns)})', records)
            # Keep the current map-style catalog but reconcile its scope IDs to the restored hubs/orgs.
            for style_id, hub_id, org_id in target.execute('SELECT id,hubId,organisationId FROM mapStyles').fetchall():
                new_hub = restored_hubs.get(hub_ids.get(hub_id)) if hub_id else None
                new_org = restored_orgs.get(org_ids.get(org_id)) if org_id else None
                if (hub_id and not new_hub) or (org_id and not new_org):
                    raise ValueError('A current map-style scope cannot be reconciled')
                target.execute('UPDATE mapStyles SET hubId=?,organisationId=? WHERE id=?', (new_hub,new_org,style_id))
            target.execute('INSERT INTO featureSearchFts(rowid,grams) SELECT id,grams FROM featureSearchContent')
            target.execute('UPDATE featureCountRevision SET revision=revision+1 WHERE id=1')
            for _, sql in triggers:
                target.execute(sql)
            # Prove exact app recovery and preservation before committing any repair.
            for table, expected in source_data.items():
                if rows(target, table) != expected:
                    raise ValueError(f'Application restoration differs: {table}')
            for table, expected in {**original_identity, **personal}.items():
                if rows(target, table) != expected:
                    raise ValueError(f'Protected state changed: {table}')
            for user_id, expected in original_users.items():
                if target.execute('SELECT * FROM user WHERE id=?', (user_id,)).fetchone() != expected:
                    raise ValueError('An existing user changed')
            violations = target.execute('PRAGMA foreign_key_check').fetchall()
            if violations:
                from collections import Counter
                raise ValueError('Application restore has unresolved foreign keys: ' + str(Counter((row[0], row[2]) for row in violations)))
            if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Restored database failed integrity')
            target.commit()
        except Exception:
            target.rollback()
            raise
        target.execute('PRAGMA foreign_keys=ON')
        return {
            'snapshot': str(snapshot_path), 'destination': str(target_path),
            'quarantinedOrphanTranslations': orphan_translations,
            'snapshotSha256': hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
            'before': before,
            'restored': {table: len(source_data[table][1]) for table in APPLICATION_TABLES},
            'historicalAuthorsWithoutCredentials': len(added_authors),
            'existingUsersUnchanged': len(original_users),
            'authenticationAndImportTablesUnchanged': True,
            'personalStateUnchanged': True, 'integrity': 'ok', 'foreignKeyViolations': 0,
        }
    finally:
        target.close()
        source.close()


def main():
    """Require explicit local destinations and create a verified backup before live repair."""
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--prepared-database')
    parser.add_argument('--database-file')
    parser.add_argument('--backup')
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    source = Path(args.snapshot).resolve(strict=True)
    if bool(args.prepared_database) == bool(args.database_file):
        parser.error('Specify one prepared database or explicit local database file')
    target = Path(args.prepared_database or args.database_file).resolve(strict=True)
    if target == source:
        parser.error('Snapshot and destination must differ')
    if args.database_file:
        namespace = root / '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
        if target.parent != namespace.resolve() or not args.backup:
            parser.error('Live repair requires the explicit local D1 namespace and a backup path')
        backup = Path(args.backup).resolve()
        if backup.exists():
            parser.error('Backup already exists')
        with sqlite3.connect(target) as original, sqlite3.connect(backup) as saved:
            original.backup(saved)
            if saved.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Pre-repair backup failed integrity')
    elif root / '.local/breadline' not in target.parents and Path('/tmp') not in target.parents:
        parser.error('Prepared repair must be in a private Breadline or temporary directory')
    receipt = restore(target, source)
    Path(args.receipt).write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({key: receipt[key] for key in ['before','restored','historicalAuthorsWithoutCredentials','existingUsersUnchanged','integrity']}, indent=2))


if __name__ == '__main__':
    main()
