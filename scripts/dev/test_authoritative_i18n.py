"""Single-store translations preserve immutable revisions and atomic writes."""
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def fixture():
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
      CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT,version INTEGER,origin TEXT,ssId TEXT,apiVersion TEXT,releaseId TEXT,snapshotId TEXT,contentHash TEXT,rawSource TEXT,facts TEXT,createdAt TEXT);
      CREATE TABLE locationRevisionI18n(revisionId TEXT REFERENCES locationRevision(id),locale TEXT,name TEXT,branch TEXT,format TEXT,displayAddress TEXT,displayAddressOverride TEXT,PRIMARY KEY(revisionId,locale));
      CREATE TRIGGER location_revision_i18n_insert AFTER INSERT ON locationRevision BEGIN SELECT 1; END;
      CREATE TRIGGER location_revision_snapshot_insert BEFORE INSERT ON locationRevision BEGIN SELECT 1; END;
      CREATE TRIGGER location_revision_no_update BEFORE UPDATE ON locationRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
      CREATE VIEW featureAcceptedNamingLocation AS SELECT 1;
    ''')
    db.executescript((ROOT/'migrations/0237_identity_catalogue.sql').read_text())
    db.executescript((ROOT/'migrations/0239_catalogue_i18n.sql').read_text())
    facts = {'schemaVersion': 1, 'kind': 'unknown', 'common': {'location': {}}, 'details': {}, 'i18n': {'en': {'name': 'Original', 'branch': '', 'displayAddress': 'Central'}, 'zh-Hant': {'name': '原名'}}}
    db.execute("INSERT INTO locationRevision VALUES('r','l',1,'local',NULL,NULL,NULL,NULL,'hash','{}',?,'now')", (json.dumps(facts),))
    db.execute("INSERT INTO locationRevisionI18n VALUES('r','en','Original','',NULL,'Central',NULL)")
    db.execute("INSERT INTO locationRevisionI18n VALUES('r','zh-Hant','原名',NULL,NULL,NULL,NULL)")
    db.execute("INSERT INTO identityCatalogue VALUES('brand','brand',2)")
    for version, name in [(1, 'Original brand'), (2, 'Curated brand')]:
        db.execute("INSERT INTO identityCatalogueRevision VALUES('brand',?,?,'actor','now')", (version, json.dumps({'i18n': {'en': {'name': name}}, 'logo': None})))
    db.commit()
    db.executescript('BEGIN;'+(ROOT/'migrations/0241_authoritative_revision_translations.sql').read_text()+'COMMIT;')
    return db, facts


class AuthoritativeTranslationsTest(unittest.TestCase):
    def setUp(self):
        self.db, self.facts = fixture()

    def tearDown(self):
        self.db.close()

    def test_single_storage_and_exact_reconstruction(self):
        stored = json.loads(self.db.execute('SELECT facts FROM locationRevision').fetchone()[0])
        self.assertNotIn('i18n', stored)
        read = json.loads(self.db.execute('SELECT facts FROM locationRevisionContent').fetchone()[0])
        self.assertEqual(read, self.facts)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_catalogue_translations_are_revision_scoped(self):
        rows = self.db.execute('SELECT version,content FROM identityCatalogueRevisionContent ORDER BY version').fetchall()
        self.assertEqual([json.loads(r[1])['i18n']['en']['name'] for r in rows], ['Original brand', 'Curated brand'])
        self.assertTrue(all('i18n' not in json.loads(r[0]) for r in self.db.execute('SELECT content FROM identityCatalogueRevision')))
        self.db.execute("UPDATE identityCatalogue SET version=1 WHERE id='brand'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM identityCatalogueI18n').fetchone()[0], 2)

    def test_translations_cannot_be_rewritten_or_appended_after_revision(self):
        for statement in ["UPDATE locationRevisionI18n SET name='bad'", "DELETE FROM locationRevisionI18n", "INSERT INTO locationRevisionI18n(revisionId,locale,name) VALUES('r','fr','bad')", "UPDATE identityCatalogueI18n SET name='bad'", "DELETE FROM identityCatalogueI18n"]:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)

    def test_late_translation_failure_rolls_back_entire_revision(self):
        self.db.executescript("CREATE TRIGGER late_failure BEFORE INSERT ON locationRevisionI18n WHEN NEW.locale='zh-Hant' BEGIN SELECT RAISE(ABORT,'late failure'); END;")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES('new','l',2,'local','hash','{}',?)", (json.dumps(self.facts),))
        self.assertEqual(self.db.execute("SELECT count(*) FROM locationRevision WHERE id='new'").fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM locationRevisionWriteScope').fetchone()[0], 0)

    def test_successful_write_has_one_store(self):
        self.db.execute("INSERT INTO locationRevisionContent(id,locationId,version,origin,contentHash,rawSource,facts) VALUES('new','l',2,'local','hash','{}',?)", (json.dumps(self.facts),))
        self.assertEqual(self.db.execute("SELECT count(*) FROM locationRevisionI18n WHERE revisionId='new'").fetchone()[0], 2)
        self.assertIsNone(self.db.execute("SELECT json_type(facts,'$.i18n') FROM locationRevision WHERE id='new'").fetchone()[0])


if __name__ == '__main__':
    unittest.main()
