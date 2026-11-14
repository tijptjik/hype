"""Apply only the canonical-draft migration to managed local D1, with a retained backup."""
import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def main():
    """Restrict writes to local development state; back up before taking the migration write lock."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('--migration', choices=['0250_location_canonical_drafts.sql', '0251_location_draft_reconciliation.sql', '0252_location_mutable_drafts.sql'], default='0250_location_canonical_drafts.sql')
    args = parser.parse_args()
    path = args.database.resolve(strict=True)
    if not path.is_relative_to(Path('.wrangler/state/v3/d1').resolve()) or path.suffix != '.sqlite':
        raise ValueError('Expected a managed local D1 database')
    migration = Path('migrations') / args.migration
    db = sqlite3.connect(path, timeout=5)
    db.execute('PRAGMA foreign_keys=ON')
    if db.execute('SELECT 1 FROM d1_migrations WHERE name=?', (migration.name,)).fetchone():
        print('Canonical draft migration is already applied')
        return
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = Path('.local/places/mtr-onboarding') / ('before-drafts-' + stamp + '.sqlite')
    backup.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(backup) as snapshot:
        db.backup(snapshot)
    # The migration has passed a full-copy rehearsal; apply only this file, not other pending work.
    try:
        db.executescript('BEGIN IMMEDIATE;' + migration.read_text())
        db.execute('INSERT INTO d1_migrations(name) VALUES (?)', (migration.name,))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print('Applied', migration.name, 'locally; backup:', backup)


if __name__ == '__main__':
    main()
