"""Preview or apply the reviewed, repeatable donor identity migration to a local SQLite file."""
from contextlib import closing
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'migrations/pending/breadline-donor-identity/curate.sql'


def report(db):
    """Report missing links and current identity coverage without donor contact data."""
    db.row_factory = sqlite3.Row
    rows = [dict(row) for row in db.execute("""
      SELECT f.id,i.title,fl.locationId,
        json_extract(h.corrections,'$.brandId.choice.value') brandId,
        json_extract(h.corrections,'$.groupId.choice.value') groupId,
        json_extract(h.corrections,'$.format.choice.value.i18n.en.value') format
      FROM feature f JOIN project p ON p.id=f.projectId AND p.code='breadline'
      LEFT JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
      LEFT JOIN featureLocation fl ON fl.featureId=f.id
      LEFT JOIN locationSharedHead h ON h.locationId=fl.locationId
      WHERE f.layerId='1msQMcuqfHrP' AND f.isDraft=0 ORDER BY i.title,f.id
    """)]
    return {
        'donors': len(rows),
        'missingLocation': [r for r in rows if not r['locationId']],
        'missingBrand': [r for r in rows if not r['brandId']],
        'withGroup': sum(bool(r['groupId']) for r in rows),
        'withFormat': sum(bool(r['format']) for r in rows),
        'withoutDistinctFormat': [r for r in rows if not r['format']],
        'catalogueRevisions': db.execute('SELECT count(*) FROM identityCatalogueRevision').fetchone()[0],
        'catalogueEntries': db.execute('SELECT count(*) FROM identityCatalogue').fetchone()[0],
        'communityRevisions': db.execute('SELECT count(*) FROM locationSharedRevision').fetchone()[0],
        'legacyBrandProperty': db.execute("SELECT count(*) FROM property WHERE id='WhWlW8KcN2wq'").fetchone()[0],
    }


def apply(db, catalogue_only=False):
    """Apply all statements atomically, including guards and foreign-key verification."""
    db.execute('PRAGMA foreign_keys=ON')
    try:
        migration = MIGRATION.read_text()
        if catalogue_only:
            migration = migration.split('-- END CATALOGUE SEED')[0] + '\nDROP TABLE _donor_groups; DROP TABLE _donor_catalogue;'
        db.executescript('BEGIN IMMEDIATE;\n' + migration)
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise RuntimeError('Foreign-key validation failed')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Database integrity validation failed')
        db.commit()
    except Exception:
        db.rollback()
        raise


def main():
    """Dry-run on an in-memory copy by default; explicit apply keeps a local backup."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--catalogue-only', action='store_true', help='Seed catalogue groups and brand affiliations without changing donor fields')
    args = parser.parse_args()
    source = args.database.resolve(strict=True)
    with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)) as original:
        preview = sqlite3.connect(':memory:')
        original.backup(preview)
    try:
        before = report(preview)
        try:
            apply(preview, args.catalogue_only)
        except Exception as error:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps({'mode': 'blocked', 'before': before, 'error': str(error)}, ensure_ascii=False, indent=2) + '\n')
            raise RuntimeError(f'Migration blocked; inspect {args.report}: {error}') from error
        after = report(preview)
        # A second run must not append history, reseed catalogue versions or reassert decisions.
        apply(preview, args.catalogue_only)
        if report(preview) != after:
            raise RuntimeError('Migration is not idempotent')
    finally:
        preview.close()
    result = {'mode': 'preview', 'before': before, 'after': after, 'idempotent': True}
    if args.apply:
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = source.with_name(source.name + '.before-donor-identity-' + stamp)
        with closing(sqlite3.connect(source)) as target, closing(sqlite3.connect(backup)) as saved:
            target.backup(saved)
            apply(target, args.catalogue_only)
            result['after'] = report(target)
        result.update(mode='applied', backup=str(backup))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ('before', 'after')}))
    print(json.dumps({k: v for k, v in result['after'].items() if not isinstance(v, list)}))
    print('Review report:', args.report)


if __name__ == '__main__':
    main()
