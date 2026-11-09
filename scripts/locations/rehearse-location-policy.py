#!/usr/bin/env python3
"""Refs #194: rehearse additive Layer policy storage against a read-only local snapshot."""

import argparse
import hashlib
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


def quoted(identifier: str) -> str:
    """Quote a retained SQLite identifier without interpreting it as SQL."""
    return '"' + identifier.replace('"', '""') + '"'


def columns(db: sqlite3.Connection, table: str) -> list[str]:
    """Read the persisted column order for an existing table."""
    return [row[1] for row in db.execute(f'PRAGMA table_info({quoted(table)})')]


def fingerprint(db: sqlite3.Connection, table: str, fields: list[str]) -> dict:
    """Hash all retained values in deterministic primary-key or rowid order."""
    info = list(db.execute(f'PRAGMA table_info({quoted(table)})'))
    primary = [row[1] for row in sorted(info, key=lambda row: row[5]) if row[5]]
    order = ','.join(map(quoted, primary)) if primary else 'rowid'
    selected = ','.join(map(quoted, fields))
    digest = hashlib.sha256()
    count = 0
    for row in db.execute(f'SELECT {selected} FROM {quoted(table)} ORDER BY {order}'):
        digest.update(json.dumps(list(row), ensure_ascii=False, separators=(',', ':'),
                                 default=lambda value: {'bytes': value.hex()}).encode())
        digest.update(b'\n')
        count += 1
    return {'count': count, 'sha256': digest.hexdigest()}


def apply_migration(db: sqlite3.Connection, migration: str) -> bool:
    """Apply only to an expected old schema; recognize a completed rehearsal on replay."""
    existing = set(columns(db, 'layer'))
    proposed = {'relocationPolicy', 'relocationPolicyRevision'}
    if proposed <= existing:
        definition = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='layer'").fetchone()[0]
        if "'fixed','review','follow'" not in definition or 'relocationPolicyRevision >= 0' not in definition:
            raise RuntimeError('Existing columns do not match the rehearsed contract')
        return False
    if proposed & existing:
        raise RuntimeError('Partially changed schema; refusing implicit repair')
    db.executescript('BEGIN IMMEDIATE;\n' + migration + '\nCOMMIT;')
    return True


def main() -> None:
    """Create private before-images, exact-ID plans and preservation/replay receipts."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-db', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    source_path = args.source_db.resolve(strict=True)
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    backup_path = out / 'before.sqlite'
    target_path = out / 'rehearsal.sqlite'
    if backup_path.exists() or target_path.exists():
        raise RuntimeError('Rehearsal files already exist; select a fresh output directory')
    repo = Path(__file__).resolve().parents[2]
    migration_path = repo / 'migrations/0143_layer_relocation_policy.sql'
    migration = migration_path.read_text()

    # SQLite backup retains a consistent WAL-aware image without writing to the source.
    with sqlite3.connect(f'file:{quote(str(source_path))}?mode=ro', uri=True) as source:
        with sqlite3.connect(backup_path) as backup:
            source.backup(backup)
    shutil.copy2(backup_path, target_path)
    with sqlite3.connect(target_path) as db:
        db.execute('PRAGMA foreign_keys=ON')
        if {'relocationPolicy', 'relocationPolicyRevision'} & set(columns(db, 'layer')):
            raise RuntimeError('Source already has policy columns; this rehearsal expects the old schema')
        tables = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        original_columns = {table: columns(db, table) for table in tables}
        before = {table: fingerprint(db, table, original_columns[table]) for table in tables}
        fk_before = list(db.execute('PRAGMA foreign_key_check'))
        observed = datetime.now(timezone.utc).isoformat()
        db.row_factory = sqlite3.Row
        layers = [dict(row) for row in db.execute(
            'SELECT id,organisationId,projectId,modifiedAt FROM layer ORDER BY id')]
        db.row_factory = None
        with (out / 'plan.jsonl').open('w') as manifest:
            for layer in layers:
                for field, value in [('relocationPolicy', None), ('relocationPolicyRevision', 0)]:
                    manifest.write(json.dumps({
                        'manifestVersion': 1, 'layerId': layer['id'],
                        'organisationId': layer['organisationId'], 'projectId': layer['projectId'],
                        'field': 'layer.' + field, 'expectedBefore': {'columnExists': False},
                        'expectedModifiedAt': layer['modifiedAt'], 'proposedAfter': value,
                        'decision': 'supported', 'evidence': [{'record': 'before.sqlite',
                            'accessedAt': observed, 'supports': 'schema-and-row-preservation'}],
                        'confidence': 'high', 'notes': 'Additive defaults only; no Feature adoption or Project policy rewrite.',
                    }, ensure_ascii=False) + '\n')
        assert apply_migration(db, migration)
        after = {table: fingerprint(db, table, original_columns[table]) for table in tables}
        conflicts = [table for table in tables if before[table] != after[table]]
        assert not conflicts, conflicts
        assert db.execute('SELECT COUNT(*) FROM layer WHERE relocationPolicy IS NOT NULL OR relocationPolicyRevision!=0').fetchone()[0] == 0
        assert list(db.execute('PRAGMA foreign_key_check')) == fk_before
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        all_fields = {table: columns(db, table) for table in tables}
        replay_before = {table: fingerprint(db, table, all_fields[table]) for table in tables}
        assert not apply_migration(db, migration)
        assert replay_before == {table: fingerprint(db, table, all_fields[table]) for table in tables}
        with backup_path.open('rb') as backup:
            backup_sha = hashlib.file_digest(backup, 'sha256').hexdigest()
        receipt = {
            'migration': str(migration_path.relative_to(repo)),
            'migrationSha256': hashlib.sha256(migration.encode()).hexdigest(),
            'backupSha256': backup_sha, 'observedAt': observed,
            'tablesVerified': len(tables), 'layersBefore': before['layer']['count'],
            'layersAfter': after['layer']['count'], 'conflictCount': len(conflicts),
            'foreignKeyViolationsBefore': len(fk_before), 'foreignKeyViolationsAfter': len(fk_before),
            'integrity': 'ok', 'replay': 'no-op', 'rollbackMaterial': 'before.sqlite',
            'before': before, 'after': after,
        }
        (out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({key: receipt[key] for key in [
            'tablesVerified', 'layersBefore', 'layersAfter', 'conflictCount',
            'foreignKeyViolationsAfter', 'integrity', 'replay', 'rollbackMaterial']}))


if __name__ == '__main__':
    main()
