"""Exercise classifier storage and the staged Stratigraphy migration with SQLite."""
import json
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def statements(path):
    """Split complete SQL statements without ignoring a failed guard."""
    pending = ''
    for line in path.read_text().splitlines(True):
        pending += line
        if sqlite3.complete_statement(pending):
            yield pending
            pending = ''
    assert not pending.strip()


def apply(db, path):
    """Apply a complete migration atomically, including DDL and failed assertions."""
    db.execute('BEGIN')
    try:
        for sql in statements(path):
            db.execute(sql)
        db.commit()
    except Exception:
        db.rollback()
        raise


def collection(*ids):
    """Serialize the public collection contract."""
    return json.dumps({'version': 1, 'propertyValueIds': list(ids)})


class MultiSelectTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.executescript('''
          PRAGMA foreign_keys=ON;
          CREATE TABLE featureCountRevision(id INTEGER PRIMARY KEY,revision INTEGER);
          INSERT INTO featureCountRevision VALUES(1,0);
          CREATE TABLE property(id TEXT PRIMARY KEY,organisationId TEXT,hubId TEXT,projectId TEXT,scope TEXT DEFAULT 'project',type TEXT DEFAULT 'classifier',key TEXT,dataType TEXT DEFAULT 'text',dateResolution TEXT DEFAULT 'day',timeMaxHour INTEGER DEFAULT 24,cardinality TEXT DEFAULT 'one',presentation TEXT DEFAULT 'text',audience TEXT DEFAULT 'public',component TEXT DEFAULT 'SelectField',min INTEGER,max INTEGER,isTranslatable INTEGER DEFAULT 1,isUserContributable INTEGER DEFAULT 1,isDefaultEnabled INTEGER DEFAULT 0,createdAt TEXT,modifiedAt TEXT);
          CREATE TABLE propertyI18n(propertyId TEXT,locale TEXT,label TEXT,labelGen INTEGER,placeholder TEXT,placeholderGen INTEGER,isAutomaticOnly INTEGER DEFAULT 0,translationProvenance TEXT);
          CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT REFERENCES property(id) ON DELETE CASCADE,rank INTEGER DEFAULT 0,value TEXT);
          CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT,valueGen INTEGER,isAutomaticOnly INTEGER DEFAULT 0,translationProvenance TEXT);
          CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT REFERENCES property(id) ON DELETE CASCADE,propertyValueId TEXT REFERENCES propertyValue(id) ON DELETE SET NULL,value TEXT,valueJson TEXT,PRIMARY KEY(featureId,propertyId));
          CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT);
          CREATE TABLE propertyCatalogRevision(id TEXT PRIMARY KEY,scope TEXT,resourceId TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT);
          CREATE TABLE propertyCatalogRevisionHead(scope TEXT,resourceId TEXT,currentRevisionId TEXT,generation INTEGER,PRIMARY KEY(scope,resourceId));
          CREATE TABLE propertyCatalogRevisionWrite(scope TEXT,resourceId TEXT,token TEXT,PRIMARY KEY(scope,resourceId));
          INSERT INTO property(id,key,cardinality) VALUES('p','multi','many'),('other','other','one');
          INSERT INTO propertyValue(id,propertyId) VALUES('a','p'),('b','p'),('x','other');
        ''')
        apply(self.db, ROOT / 'migrations/0263_multi_select_classifiers.sql')

    def tearDown(self):
        self.db.close()

    def test_collection_round_trip_and_option_cascade(self):
        self.db.execute('INSERT INTO featureProperty VALUES(?,?,?,?,?)', ('f','p',None,None,collection('a','b')))
        self.db.execute("DELETE FROM propertyValue WHERE id='a'")
        self.assertEqual(self.db.execute('SELECT revision FROM featureCountRevision').fetchone()[0],1)
        self.assertEqual(json.loads(self.db.execute('SELECT valueJson FROM featureProperty').fetchone()[0]), {'version':1,'propertyValueIds':['b']})
        self.db.execute("DELETE FROM propertyValue WHERE id='b'")
        self.assertIsNone(self.db.execute('SELECT valueJson FROM featureProperty').fetchone()[0])

    def test_rejects_foreign_duplicate_unknown_and_malformed_values(self):
        for value in [collection('x'),collection('missing'),collection('a','a'),collection(),'{','{}','null',json.dumps({'version':2,'propertyValueIds':['a']}),json.dumps({'version':1,'propertyValueIds':['a'],'extra':True}),collection(*['a']*101)]:
            with self.subTest(value=value), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute('INSERT INTO featureProperty VALUES(?,?,?,?,?)', ('f','p',None,None,value))
        self.assertEqual(self.db.execute('SELECT count(*) FROM featureProperty').fetchone()[0],0)

    def test_prevents_contract_narrowing_and_identity_reassignment(self):
        self.db.execute('INSERT INTO featureProperty VALUES(?,?,?,?,?)', ('f','p',None,None,collection('a','b')))
        for sql in ["UPDATE property SET cardinality='one' WHERE id='p'", "UPDATE property SET component='InputField' WHERE id='p'", "UPDATE propertyValue SET propertyId='other' WHERE id='a'", "UPDATE propertyValue SET id='new' WHERE id='a'", "UPDATE featureProperty SET propertyValueId='a'"]:
            with self.subTest(sql=sql), self.assertRaises(sqlite3.IntegrityError): self.db.execute(sql)

    def test_singletons_survive_widening_and_migration_is_repeatable(self):
        pid='af38c4209f82'
        self.db.execute("INSERT INTO property(id,projectId,key) VALUES(?,'YuSFnia9VOtG','stratigraphy')",(pid,))
        self.db.execute("INSERT INTO propertyValue(id,propertyId) VALUES('revealed',?)",(pid,))
        self.db.execute("INSERT INTO featureProperty VALUES('sign',?,'revealed',NULL,NULL)",(pid,))
        before=list(self.db.execute('SELECT * FROM featureProperty'))
        path=ROOT/'migrations/pending/ghost-signs-stratigraphy/enable-multi-select.sql'
        apply(self.db,path)
        self.assertEqual(self.db.execute('SELECT cardinality FROM property WHERE id=?',(pid,)).fetchone()[0],'many')
        self.assertEqual(list(self.db.execute('SELECT * FROM featureProperty')),before)
        revisions=list(self.db.execute('SELECT content FROM propertyCatalogRevision ORDER BY rowid'))
        self.assertEqual([json.loads(row[0])[pid]['record']['cardinality'] for row in revisions],['one','many'])
        apply(self.db,path)
        self.assertEqual(list(self.db.execute('SELECT content FROM propertyCatalogRevision ORDER BY rowid')),revisions)
        self.assertEqual(self.db.execute('SELECT count(*) FROM propertyCatalogRevisionWrite').fetchone()[0],0)

    def test_pending_migration_fails_without_taxonomy(self):
        with self.assertRaises(sqlite3.IntegrityError):
            apply(self.db,ROOT/'migrations/pending/ghost-signs-stratigraphy/enable-multi-select.sql')
        self.assertFalse(self.db.execute("SELECT name FROM sqlite_master WHERE name LIKE '_hkgs_many_%'").fetchall())


if __name__ == '__main__':
    unittest.main()
