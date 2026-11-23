#!/usr/bin/env python3
"""Record atomic schema/data migrations for the independent revision deployment.

Uses the existing reviewed historical-layer prerequisite and preserves the known
production preference default. Never imports Breadline data or seeds local users.
"""
import importlib.util
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def load(name, path):
    """Load a repository migration dependency without invoking its CLI."""
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def statements(source):
    """Split complete SQLite statements, preserving triggers and quoted semicolons."""
    pending = ''
    for char in source:
        pending += char
        if char == ';' and sqlite3.complete_statement(pending):
            yield pending
            pending = ''
    if re.sub(r'--[^\n]*|/\*.*?\*/', '', pending, flags=re.S).strip():
        if not sqlite3.complete_statement(pending + ';'):
            raise RuntimeError('Incomplete migration statement')
        yield pending


class RecordingConnection(sqlite3.Connection):
    """Capture top-level commands, without replaying trigger-expanded trace output."""
    recorded = None
    record_all = False

    def execute(self, sql, parameters=()):
        result = super().execute(sql, parameters)
        clean = re.sub(r'--[^\n]*|/\*.*?\*/', '', sql, flags=re.S).strip()
        if self.recorded is not None and (self.record_all or not re.match(r'^(SELECT|PRAGMA\s+(table_info|foreign_key_check|integrity_check))\b', clean, re.I)):
            if not re.match(r'^(BEGIN|COMMIT|ROLLBACK)\b', clean, re.I):
                self.recorded.append(dict(sql=sql, params=list(parameters)))
        return result

    def executescript(self, source):
        self.record_all = True
        try:
            for sql in statements(source):
                self.execute(sql)
        finally:
            self.record_all = False
        return self.cursor()


def canonical_tables(db):
    """Exclude SQLite/D1 internals and derived FTS shadow tables from write fences."""
    return [r[0] for r in db.execute("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
            if not r[0].startswith(('sqlite_', '_cf_', 'featureSearchFts', '_revisionDeployment'))]


def placeholder_fences(db):
    """Track fence survival through table rebuilds without blocking offline enrollment."""
    missing = []
    for table in canonical_tables(db):
        names = [f'revision_deploy_{table}_{op}' for op in ('INSERT', 'UPDATE', 'DELETE')]
        if any(not db.execute("SELECT 1 FROM sqlite_schema WHERE name=? AND tbl_name=?", (name, table)).fetchone() for name in names):
            missing.append(table)
        for op, name in zip(('INSERT', 'UPDATE', 'DELETE'), names):
            db.execute(f'CREATE TRIGGER IF NOT EXISTS "{name}" BEFORE {op} ON "{table}" WHEN 0 BEGIN SELECT 1; END')
    return missing


def main():
    """Rehearse pending migrations and retain the exact successful units."""
    database, output = sys.argv[1:]
    db = sqlite3.connect(database, factory=RecordingConnection)
    db.execute('PRAGMA foreign_keys=ON')
    helper = load('revision_migration_helpers', 'scripts/dev/rebuild-database.py')
    historical = load('revision_historical_dependency', 'scripts/locations/setup-historical-layers.py')
    done = {r[0] for r in db.execute('SELECT name FROM d1_migrations')}
    current_lifecycle = any(row[1] == 'currentRevisionId' for row in db.execute("PRAGMA table_info('feature')"))
    bookstores = '0207_former_bookstore_occupancy.sql'
    groups = []
    placeholder_fences(db)
    db.commit()
    # The reviewed bookstore data uses accepted Feature heads and the current Location
    # taxonomy. It is journaled after those contracts exist on the converted snapshot.
    paths = sorted((ROOT / 'migrations').glob('*.sql'), key=lambda p: (p.name == bookstores, p.name))
    for path in paths:
        if path.name in done:
            continue
        if path.name == bookstores and not current_lifecycle:
            continue
        db.execute('BEGIN IMMEDIATE')
        db.recorded = []
        try:
            if path.name == '0152_historical_layer_descriptions.sql':
                db.row_factory = sqlite3.Row
                before = historical.inventory(db)
                retained = historical.retained_hashes(db)
                historical.seed(db)
                historical.verify(db, before)
                if historical.retained_hashes(db) != retained:
                    raise RuntimeError('Historical dependency changed retained evidence')
                db.row_factory = None
            sql = helper.local_migration_sql(db, path.name, path.read_text())
            # The audited rebuild rejects unknown triggers. Our reserved maintenance
            # triggers are verified/reinstalled atomically by the rollout contract.
            if path.name == '0169_audit_column_order.sql':
                sql = sql.replace("WHERE type='trigger' AND name NOT IN", "WHERE type='trigger' AND name NOT GLOB 'revision_deploy_*' AND name NOT IN")
            db.executescript(sql)
            db.execute('INSERT INTO d1_migrations(name) VALUES(?)', (path.name,))
            if db.execute('PRAGMA foreign_key_check').fetchone():
                raise RuntimeError('Migration foreign key failure')
            recorded = db.recorded
            db.recorded = None
            missing = placeholder_fences(db)
            group = dict(label=path.name, statements=recorded, tables=canonical_tables(db), fenceTables=missing)
            db.commit()
            groups.append(group)
        except Exception as exc:
            db.rollback()
            raise RuntimeError(f'Migration rehearsal failed at {path.name}') from exc
        finally:
            db.recorded = None
    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('Migration integrity failure')
    Path(output).write_text(json.dumps(groups, indent=2) + '\n')
    for (name,) in db.execute("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'revision_deploy_%'").fetchall():
        db.execute(f'DROP TRIGGER "{name}"')
    db.commit()
    db.close()


if __name__ == '__main__':
    main()
