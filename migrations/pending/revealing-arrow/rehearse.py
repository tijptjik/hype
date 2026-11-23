"""Rehearse the pending recording migration on a disposable copy; never writes the source."""
import sqlite3,json,pathlib,tempfile,sys
folder=pathlib.Path(__file__).resolve().parent
if len(sys.argv)!=2:raise SystemExit('Usage: dev-check python migrations/pending/revealing-arrow/rehearse.py SOURCE.sqlite')
rows=json.loads((folder/'records.json').read_text())
source=sqlite3.connect('file:'+str(pathlib.Path(sys.argv[1]).resolve())+'?mode=ro',uri=True)
with tempfile.TemporaryDirectory(prefix='revealing-arrow-') as tmp:
 c=sqlite3.connect(tmp+'/test.sqlite');source.backup(c)
 triggers=c.execute("select name,sql from sqlite_master where type='trigger'").fetchall()
 c.execute('pragma foreign_keys=off')
 for name,_ in triggers:c.execute('DROP TRIGGER "'+name+'"')
 for t,rs in rows.items():
  cols=c.execute('pragma table_info("'+t+'")').fetchall();pk=[r[1] for r in sorted(cols,key=lambda r:r[5]) if r[5]]
  for r in rs:
   c.execute('DELETE FROM "'+t+'" WHERE '+' AND '.join('"'+k+'" IS ?' for k in pk),[r[k] for k in pk])
 for t in ['featureSpatial','featureSearchDocument','featureDivisionJob','featureMtrJob','featureCountEntry','featureRevisionImage']:
  col='featureRevisionId' if t=='featureRevisionImage' else 'featureId'
  ids=[r['id'] for r in rows['featureRevision']] if t=='featureRevisionImage' else ['rx81h67xsLkz']
  for value in ids:c.execute('DELETE FROM "'+t+'" WHERE "'+col+'"=?',[value])
 c.execute("DELETE FROM locationRefreshItem WHERE locationId='PWfsRUiasaYN'")
 for _,sql in triggers:c.execute(sql)
 c.commit();c.execute('pragma foreign_keys=on')
 baseline=c.execute('pragma foreign_key_check').fetchall()
 assert not baseline,baseline[:5]
 sql=(folder/'migration.sql').read_text()
 before_features=c.execute('select count(*) from feature').fetchone()[0]
 try:c.executescript('BEGIN;\n'+sql+'\nCOMMIT;')
 except: c.rollback();raise
 assert c.execute('select count(*) from feature').fetchone()[0]==before_features+1
 assert not c.execute('pragma foreign_key_check').fetchall()
 assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
 for t,rs in rows.items():
  cols=c.execute('pragma table_info("'+t+'")').fetchall();pk=[r[1] for r in sorted(cols,key=lambda r:r[5]) if r[5]]
  for row in rs:
   r=dict(row)
   if t=='featureLocationHistory':r.pop('id');pk=['featureId','version']
   if t=='image':r['env']='production'
   if t=='imageAssetVersion':r['storageNamespace']='production'
   got=c.execute('SELECT '+','.join('"'+k+'"' for k in r)+' FROM "'+t+'" WHERE '+' AND '.join('"'+k+'" IS ?' for k in pk),[r[k] for k in pk]).fetchone()
   assert got==tuple(r.values()),(t,pk,got,tuple(r.values()))
 assert c.execute("select count(*) from featureRevisionImage where featureRevisionId='ffc4084b-12bd-4a2f-9d0e-00c0fc73ea72'").fetchone()[0]==2
 assert c.execute("select count(*) from featureSearchDocument where featureId='rx81h67xsLkz'").fetchone()[0]==3
 assert sorted(triggers)==sorted(c.execute("select name,sql from sqlite_master where type='trigger'").fetchall())
 try:c.executescript('BEGIN;\n'+sql+'\nCOMMIT;')
 except sqlite3.IntegrityError:c.rollback()
 else:raise AssertionError('Duplicate migration must fail')
 print('PASS: exact imported records, gallery pins, search projection, foreign keys, integrity, restored triggers, duplicate guard')
