#!/usr/bin/env python3
"""Refs #194. Rehearse all pending HYPE migrations on a fresh local export, with replay and preservation receipts."""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


def fingerprint(db, table, fields, retained_ids=None):
    """Digest explicitly preserved columns without exporting their private values into the report."""
    digest=hashlib.sha256()
    count=0
    for row in db.execute('SELECT '+','.join('"'+f+'"' for f in fields)+' FROM "'+table+'" ORDER BY id'):
        if retained_ids is not None and row[0] not in retained_ids:continue
        digest.update(json.dumps(list(row),ensure_ascii=False,separators=(',',':')).encode());digest.update(b'\n');count+=1
    return {'rows':count,'sha256':digest.hexdigest()}


def apply_pending(db, repo, before_migration=None):
    """Apply each unrecorded migration transactionally; retain the standard D1 migration ledger."""
    done={r[0] for r in db.execute('SELECT name FROM d1_migrations')}
    applied=[]
    for path in sorted((repo/'migrations').glob('*.sql')):
        if path.name in done:continue
        if before_migration is not None: before_migration(path.name)
        print('Applying '+path.name,flush=True)
        try:
            # The D1 ledger insert is inside the same transaction as the schema/data transformation.
            name=path.name.replace("'","''")
            db.executescript('BEGIN IMMEDIATE;\n'+path.read_text()+f"\nINSERT INTO d1_migrations(name) VALUES('{name}');\nCOMMIT;")
        except Exception:
            db.rollback();raise
        applied.append({'name':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return applied


def main():
    """Copy a read-only export, preserve rollback material, and fail on changed editorial ownership/publication."""
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-db',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True)
    args=p.parse_args();out=args.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
    source=args.source_db.resolve(strict=True);target=out/'rehearsal.sqlite';before=out/'before.sqlite'
    with sqlite3.connect('file:'+quote(str(source))+'?mode=ro',uri=True) as src:
        with sqlite3.connect(before) as backup:src.backup(backup)
        with sqlite3.connect(target) as dst:src.backup(dst)
    db=sqlite3.connect(target);db.execute('PRAGMA foreign_keys=ON')
    fields=['id','organisationId','projectId','layerId','geometry','isPublished','isArchived','isDraft']
    original_ids={row[0] for row in db.execute('SELECT id FROM feature')}
    preservation=fingerprint(db,'feature',fields)
    revision_columns={r[1] for r in db.execute('PRAGMA table_info(locationRevision)')}
    revision_before=fingerprint(db,'locationRevision',['id','locationId','contentHash','rawSource' if 'rawSource' in revision_columns else 'payload'])
    report={'source':str(source),'createdAt':datetime.now(timezone.utc).isoformat(),'featureBefore':preservation,'rollback':'before.sqlite','locationRevisionBefore':revision_before}
    try:
        report['applied']=apply_pending(db,Path(__file__).resolve().parents[2])
        report['featureAfter']=fingerprint(db,'feature',fields,original_ids)
        report['locationRevisionAfter']=fingerprint(db,'locationRevision',['id','locationId','contentHash','rawSource'])
        if report['locationRevisionAfter']!=revision_before:raise RuntimeError('Immutable source evidence or content hashes changed')
        report['featuresAddedByPendingMigrations']=db.execute('SELECT count(*) FROM feature').fetchone()[0]-len(original_ids)
        if report['featureAfter']!=preservation:raise RuntimeError('Feature identity, ownership, publication or accepted pin changed')
        if db.execute('PRAGMA foreign_key_check').fetchone():raise RuntimeError('Foreign-key check failed')
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Integrity check failed')
        report['replay']=apply_pending(db,Path(__file__).resolve().parents[2])
        if report['replay']:raise RuntimeError('Replay unexpectedly applied migrations')
        report['status']='passed'
    except Exception as error:
        report['status']='failed';report['error']=str(error);raise
    finally:
        (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');db.close()

if __name__=='__main__':main()
