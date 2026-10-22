#!/usr/bin/env python3
"""Refs #194. Transactional SQLite operations for the normal development rebuild."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


def checked(db):
    """Reject incomplete imports before they can replace the development database."""
    if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise RuntimeError('SQLite integrity check failed')
    if db.execute('PRAGMA foreign_key_check').fetchone():
        raise RuntimeError('Foreign-key check failed')


def module(name, path):
    """Load an existing repository conversion without duplicating its policy."""
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def main():
    """Apply local-only build steps, or install with a consistent rollback backup."""
    os.umask(0o077)
    action, database, *args = sys.argv[1:]
    db = sqlite3.connect(database, timeout=10)
    db.execute('PRAGMA foreign_keys=ON')
    try:
        if action == 'migrate':
            migration = module('migration', 'scripts/locations/rehearse-lifecycle.py')
            def prepare_dependency(name):
                # 0152 requires the reviewed collection setup; it is real data conversion, not a mock.
                if name != '0152_historical_layer_descriptions.sql':
                    return
                historical = module('historical', 'scripts/locations/setup-historical-layers.py')
                db.row_factory = sqlite3.Row
                before = historical.inventory(db)
                retained = historical.retained_hashes(db)
                with db:
                    historical.seed(db)
                    counts = historical.verify(db, before)
                    if historical.retained_hashes(db) != retained:
                        raise RuntimeError('Historical setup changed retained history')
                after = historical.inventory(db)
                with db:
                    historical.seed(db)
                assert historical.inventory(db) == after
                Path(args[0]).with_name('historical-setup.json').write_text(json.dumps(dict(before=before, after=after, counts=counts)))
                db.row_factory = None
            applied = migration.apply_pending(db, ROOT, prepare_dependency)
            checked(db)
            assert not migration.apply_pending(db, ROOT)
            Path(args[0]).write_text(json.dumps(applied, indent=2))
        elif action == 'sql':
            # executescript stops at the first error; ledger and history triggers share this transaction.
            try:
                db.executescript('BEGIN IMMEDIATE;\n' + Path(args[0]).read_text() + '\nCOMMIT;')
            except Exception:
                db.rollback()
                raise
            checked(db)
        elif action == 'kinds':
            kinds = module('kinds', 'scripts/locations/seed-location-kinds.py')
            db.row_factory = sqlite3.Row
            plan = kinds.plan(db, 'migration:dataset-location-kinds')
            Path(args[0]).write_text(json.dumps(plan, ensure_ascii=False, indent=2))
            kinds.apply_local(db, plan, False)
            kinds.apply_local(db, plan, False)
            db.row_factory = None
            checked(db)
        elif action == 'policies':
            policies = module('policies', 'scripts/locations/rehearse-dataset-relocation.py')
            rows = []
            for name, org, project, layers, policy in policies.DATASETS:
                for layer in layers:
                    old = db.execute('SELECT relocationPolicy,relocationPolicyRevision FROM layer WHERE id=? AND projectId=? AND organisationId=? AND isArchived=0', (layer, project, org)).fetchone()
                    if not old:
                        raise RuntimeError('Dataset ancestry mismatch: ' + name)
                    if old[0] == policy:
                        continue
                    rows.append(dict(manifestVersion=1, dataset=name, layerId=layer, projectId=project, organisationId=org, field='layer.relocationPolicy', expectedBefore=dict(value=old[0], revision=old[1]), proposedAfter=policy, decision='supported', evidence=[dict(url='https://github.com/tijptjik/hype/issues/194', supports='explicit user policy')]))
            Path(args[0]).write_text(''.join(json.dumps(r)+'\n' for r in rows))
            policies.apply(db, rows)
            assert policies.apply(db, rows) == 0
            checked(db)
        elif action == 'install':
            destination, backup = map(Path, args)
            namespace = (ROOT / '.wrangler/state/v3/d1/miniflare-D1DatabaseObject').resolve()
            destination = destination.resolve(strict=True)
            if destination.parent != namespace or len(destination.stem) != 64 or any(c not in '0123456789abcdef' for c in destination.stem):
                raise RuntimeError('Not the normal local D1 database')
            # An open application may cache prepared schema or write between backup and installation.
            active = subprocess.run(['fuser', str(destination), str(destination)+'-wal', str(destination)+'-shm'], capture_output=True)
            if active.returncode == 0:
                raise RuntimeError('Stop the development server before rebuilding its database')
            if active.returncode != 1:
                raise RuntimeError('Unable to check database writers')
            checked(db)
            target = sqlite3.connect(destination, timeout=10)
            if backup.exists():
                raise RuntimeError('Backup already exists')
            with sqlite3.connect(backup) as old:
                target.backup(old)
                checked(old)
            # Miniflare engine metadata belongs to the local target, not the production export.
            metadata = target.execute("SELECT sql FROM sqlite_schema WHERE name='_cf_METADATA'").fetchone()
            if metadata:
                db.execute('DROP TABLE IF EXISTS _cf_METADATA')
                db.execute(metadata[0])
                for row in target.execute('SELECT * FROM _cf_METADATA'):
                    db.execute('INSERT INTO _cf_METADATA VALUES ('+','.join('?' for _ in row)+')', row)
                db.commit()
            db.backup(target)
            checked(target)
            target.close()
        elif action == 'check':
            checked(db)
            if db.execute("SELECT 1 FROM feature WHERE spatialIndex IS NULL AND json_extract(geometry,'$.type')='Point' LIMIT 1").fetchone():
                raise RuntimeError('Point Features missing spatial cells')
            if db.execute('SELECT 1 FROM featureSpatial s JOIN feature f ON f.id=s.featureId WHERE s.layerId<>f.layerId LIMIT 1').fetchone():
                raise RuntimeError('Spatial cells disagree with Feature layers')
            print(json.dumps({table: db.execute('SELECT count(*) FROM '+table).fetchone()[0] for table in ['feature','location','user','breadlineImportIdentity','breadlineImportFeature','d1_migrations']}))
        else:
            raise RuntimeError('Unknown local operation')
    finally:
        db.close()


if __name__ == '__main__':
    main()
