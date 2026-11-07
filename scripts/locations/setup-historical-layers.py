"""Refs #194: exact-ID local historical-layer rehearsal and guarded application.

No remote access. Keeps a SQLite before-image and private JSON inventory; defaults
 to an isolated rehearsal. --apply requires the selected database to match the plan.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGETS = [
    ('EovGYWS-GSon','neon','lMsnrDxWhJss','opQQLGHoFwkE',('Current','現存','现存'),('Dismantled','已拆卸','已拆卸')),
    ('YuSFnia9VOtG','hkghostsigns','7akti7OImSFg','history:7akti7OImSFg',('Current','現存','现存'),('Historic','歷史','历史')),
    ('-z26MuNRTJwi','independentBookstores','RfWMLs_jW6QJ','history:RfWMLs_jW6QJ',('Open','營業中','营业中'),('Permanently Closed','永久結業','永久结业')),
]
MIGRATION = ROOT/'migrations/0147_historical_layers.sql'

def connect(path):
    db=sqlite3.connect(path); db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def inventory(db):
    result={}
    for pid,code,source,child,*_ in TARGETS:
        project=dict(db.execute('SELECT * FROM project WHERE id=?',(pid,)).fetchone())
        assert project['code']==code
        layers=[dict(r) for r in db.execute('SELECT * FROM layer WHERE projectId=? ORDER BY id',(pid,))]
        assert any(l['id']==source and l['projectId']==pid for l in layers)
        result[pid]={'project':project,'layers':layers,
          'features':[dict(r) for r in db.execute('SELECT id,layerId,isIntangible,isVisitable,isPublished,isArchived,modifiedAt FROM feature WHERE projectId=? ORDER BY id',(pid,))],
          'i18n':[dict(r) for r in db.execute('SELECT * FROM layerI18n WHERE layerId IN (SELECT id FROM layer WHERE projectId=?) ORDER BY layerId,locale',(pid,))],
          'fields':[dict(r) for r in db.execute('SELECT * FROM layerProperty WHERE layerId IN (SELECT id FROM layer WHERE projectId=?) ORDER BY layerId,propertyId',(pid,))]}
    return result

def retained_hashes(db):
    names={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return {table:hashlib.sha256(json.dumps([tuple(r) for r in db.execute('SELECT * FROM "'+table+'" ORDER BY rowid')],ensure_ascii=False).encode()).hexdigest()
      for table in ('location','locationRevision','featureLocation','featureLocationHistory','organisationLocation','featureProperty','featureI18n','image') if table in names}

def migrate(db):
    if 'historicalSourceLayerId' in [r[1] for r in db.execute('PRAGMA table_info(layer)')]: return
    statement=''
    for line in MIGRATION.read_text().splitlines(True):
        statement+=line
        if sqlite3.complete_statement(statement):
            db.execute(statement);statement=''
    db.execute('INSERT INTO d1_migrations(name) VALUES(?)',(MIGRATION.name,))

def seed(db):
    # Adopt the existing Neon Dismantled identity rather than replace its settings or ID.
    db.execute("UPDATE layer SET historicalSourceLayerId='lMsnrDxWhJss' WHERE id='opQQLGHoFwkE' AND historicalSourceLayerId IS NULL")
    for pid,code,source,child,current,historic in TARGETS:
        db.execute("UPDATE project SET flags=json_set(flags,'$.showHistoricalLayers',json('true')),modifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND coalesce(json_extract(flags,'$.showHistoricalLayers'),0)!=1",(pid,))
        if code=='neon':
            db.execute("UPDATE feature SET isIntangible=1,modifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE layerId=? AND isIntangible=0",(child,))
        for lid,names in [(source,current),(child,historic)]:
            for locale,name in zip(('en','zh-hant','zh-hans'),names):
                db.execute('UPDATE layerI18n SET name=?,nameShort=?,nameGen=0,nameShortGen=0 WHERE layerId=? AND locale=? AND (name!=? OR nameShort!=?)',(name,name,lid,locale,name,name))
        if code=='independentBookstores':
            db.execute("UPDATE layer SET metadata=json_set(coalesce(metadata,'{}'),'$.markerStyleCode','image-bw') WHERE id=? AND coalesce(json_extract(metadata,'$.markerStyleCode'),'')!='image-bw'",(child,))

def verify(db,before):
    counts=[]
    for pid,code,source,child,*_ in TARGETS:
        rows=[dict(r) for r in db.execute('SELECT id,layerId,isIntangible,isVisitable,isPublished,isArchived,modifiedAt FROM feature WHERE projectId=? ORDER BY id',(pid,))]
        old={r['id']:r for r in before[pid]['features']}
        assert set(old)=={r['id'] for r in rows}
        for row in rows:
            original=old[row['id']]
            for field in ('isPublished','isArchived','isVisitable'): assert row[field]==original[field]
            if row['layerId'] in (source,child): assert row['layerId']==(child if row['isIntangible'] else source)
        counts.append({'projectId':pid,'code':code,'features':len(rows),'historic':sum(r['layerId']==child for r in rows),'current':sum(r['layerId']==source for r in rows)})
    return counts

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--database',required=True);ap.add_argument('--output',required=True);ap.add_argument('--apply',action='store_true');args=ap.parse_args()
    out=Path(args.output);out.mkdir(parents=True,exist_ok=False)
    live=connect(args.database);before=inventory(live);retained=retained_hashes(live);foreign_keys=[tuple(r) for r in live.execute('PRAGMA foreign_key_check')]
    (out/'before.json').write_text(json.dumps(before,ensure_ascii=False,indent=2))
    backup=connect(out/'before.sqlite');live.backup(backup);backup.close()
    rehearsal=connect(out/'rehearsal.sqlite');src=connect(out/'before.sqlite');src.backup(rehearsal);src.close()
    rehearsal.execute('BEGIN IMMEDIATE');migrate(rehearsal);seed(rehearsal);counts=verify(rehearsal,before);rehearsal.commit()
    assert retained_hashes(rehearsal)==retained, 'Retained history/media changed'
    assert [tuple(r) for r in rehearsal.execute('PRAGMA foreign_key_check')]==foreign_keys
    first=inventory(rehearsal);rehearsal.execute('BEGIN IMMEDIATE');seed(rehearsal);rehearsal.commit();assert inventory(rehearsal)==first
    (out/'after.json').write_text(json.dumps(first,ensure_ascii=False,indent=2))
    # One assertion per changed Feature field, with exact IDs/old values and user provenance.
    with (out/'manifest.v1.jsonl').open('w') as manifest:
        for pid in before:
            old={r['id']:r for r in before[pid]['features']}
            for row in first[pid]['features']:
                for field in ('layerId','isIntangible'):
                    if row[field]!=old[row['id']][field]:
                        manifest.write(json.dumps({'manifestVersion':1,'featureId':row['id'],'field':field,'expectedBefore':old[row['id']][field],'expectedModifiedAt':old[row['id']]['modifiedAt'],'proposedAfter':row[field],'decision':'supported','evidence':[],'notes':'Explicit user collection configuration; no inferred business closure.'})+'\n')
    if args.apply:
        live.execute('BEGIN IMMEDIATE')
        assert inventory(live)==before,'STALE_PLAN: local rows changed during rehearsal'
        migrate(live);seed(live);assert verify(live,before)==counts
        assert retained_hashes(live)==retained, 'Retained history/media changed'
        assert [tuple(r) for r in live.execute('PRAGMA foreign_key_check')]==foreign_keys
        live.commit()
        assert inventory(live)==first or verify(live,before)==counts
    receipt={'database':str(Path(args.database).resolve()),'applied':args.apply,'counts':counts,'conflicts':0,'retainedHistoryAndMediaHashes':retained,'foreignKeyCheck':'no new violations','replay':'unchanged','rollback':'before.sqlite and before.json retain exact scoped before-images; restore only after checking later writes'}
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt,indent=2))

if __name__=='__main__': main()
