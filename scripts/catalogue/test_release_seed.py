"""Rehearse the release seed against the real catalogue schema and revision triggers."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / 'migrations/0247_seed_active_identity_catalogue.sql').read_text()


def database():
    """Create only the catalogue schema using the repository migrations."""
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    for name in ['0237_identity_catalogue.sql', '0239_catalogue_i18n.sql']:
        db.executescript((ROOT / 'migrations' / name).read_text())
    authoritative = (ROOT / 'migrations/0241_authoritative_revision_translations.sql').read_text()
    db.executescript('DROP TRIGGER identity_catalogue_i18n_revision;' + authoritative.split('DROP TRIGGER identity_catalogue_i18n_revision;')[1].split('DROP VIEW featureAcceptedNamingLocation;')[0])
    db.executescript((ROOT / 'migrations/0245_catalogue_group_hierarchy.sql').read_text())
    return db


def apply(db, sql=SQL):
    """Mirror D1 migration transaction boundaries, including failure rollback."""
    statement = ''
    with db:
        db.execute('BEGIN')
        for line in sql.splitlines(True):
            statement += line
            if sqlite3.complete_statement(statement):
                db.execute(statement)
                statement = ''
        if statement.strip():
            raise AssertionError('Incomplete SQL')


def insert(db, identity, kind, content, version=1):
    """Insert an independent production record using the authoritative view."""
    db.execute('INSERT INTO identityCatalogue(id,kind,version) VALUES(?,?,?)', (identity, kind, version))
    db.execute('INSERT INTO identityCatalogueRevisionContent VALUES(?,?,?,?,?)', (identity, version, json.dumps(content), 'production-editor', '2026-11-13T00:00:00Z'))
    db.commit()


class ReleaseSeedTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.addCleanup(self.db.close)

    def test_complete_active_snapshot_and_replay(self):
        apply(self.db)
        self.assertEqual(self.db.execute('SELECT kind,count(*) FROM identityCatalogue GROUP BY kind').fetchall(), [('brand', 14), ('group', 7)])
        rows = self.db.execute('SELECT catalogueId,content FROM identityCatalogueRevisionContent').fetchall()
        self.assertEqual(len(rows), 21)
        for identity, raw in rows:
            content = json.loads(raw)
            self.assertFalse(content.get('isArchived', False))
            self.assertRegex(content['logo'], r'^/api/identity-catalogue/logos/[a-f0-9-]{36}$')
            self.assertEqual(set(content['i18n']), {'en', 'zh-Hant', 'zh-Hans'})
        self.assertEqual(self.db.execute('SELECT count(*) FROM identityCatalogueSource').fetchone()[0], 14)
        self.assertEqual(self.db.execute('SELECT groupId FROM identityCatalogue WHERE id=?', ('bl-group-dfi',)).fetchone(), (None,))
        self.assertEqual(self.db.execute('SELECT groupId FROM identityCatalogue WHERE id=?', ('bl-group-maxims-group',)).fetchone(), ('bl-group-dfi',))
        for identity in ['bl-brand-979304c697eaae04756dd221', 'bl-brand-f92a296e7ea8ebb1653c2f7e']:
            self.assertEqual(self.db.execute('SELECT groupId FROM identityCatalogue WHERE id=?', (identity,)).fetchone(), ('bl-group-maxims-group',))
        before = list(self.db.iterdump())
        apply(self.db)
        self.assertEqual(before, list(self.db.iterdump()))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_existing_production_edits_and_archives_are_preserved(self):
        content = {'i18n': {'en': {'name': 'Production-authored DFI'}}, 'code': 'dfi-live', 'isArchived': True}
        insert(self.db, 'bl-group-dfi', 'group', content, 99)
        apply(self.db)
        raw, actor = self.db.execute('SELECT content,actorId FROM identityCatalogueRevisionContent WHERE catalogueId=?', ('bl-group-dfi',)).fetchone()
        self.assertEqual(json.loads(raw), content)
        self.assertEqual(actor, 'production-editor')
        self.assertEqual(self.db.execute('SELECT version FROM identityCatalogue WHERE id=?', ('bl-group-dfi',)).fetchone(), (99,))

    def assert_conflict_rolls_back(self):
        before = list(self.db.iterdump())
        with self.assertRaises(sqlite3.IntegrityError):
            apply(self.db)
        self.assertEqual(before, list(self.db.iterdump()))

    def test_kind_conflict_rolls_back(self):
        insert(self.db, 'bl-group-dfi', 'brand', {'i18n': {'en': {'name': 'Other'}}})
        self.assert_conflict_rolls_back()

    def test_code_conflict_rolls_back(self):
        insert(self.db, 'different-dfi', 'group', {'i18n': {'en': {'name': 'Other'}}, 'code': 'dfi'})
        self.assert_conflict_rolls_back()

    def test_source_conflict_rolls_back(self):
        insert(self.db, 'different-brand', 'brand', {'i18n': {'en': {'name': 'Other'}}})
        self.db.execute("INSERT INTO identityCatalogueSource VALUES('brand:breadlineBrand','arome','different-brand')")
        self.db.commit()
        self.assert_conflict_rolls_back()

    def test_revision_failure_rolls_back_inserted_heads(self):
        before = list(self.db.iterdump())
        broken = SQL.replace('"groupId":"bl-group-yamazaki-group"', '"groupId":"missing-parent"')
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'CATALOGUE_GROUP_REQUIRED'):
            apply(self.db, broken)
        self.assertEqual(before, list(self.db.iterdump()))

    def test_export_excludes_archives_and_preserves_wikidata(self):
        insert(self.db, 'archived', 'group', {'i18n': {'en': {'name': 'Archived'}}, 'isArchived': True})
        insert(self.db, 'active', 'brand', {'i18n': {'en': {'name': "Baker's"}}, 'groupId': 'archived'})
        self.db.execute("INSERT INTO identityCatalogueSource VALUES('brand:wikidata','Q123','active')")
        self.db.commit()
        spec = importlib.util.spec_from_file_location('export_seed', ROOT / 'scripts/catalogue/export-release-seed.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'source.sqlite'
            with sqlite3.connect(path) as target:
                self.db.backup(target)
            output = Path(folder) / 'seed.sql'
            module.export(path, output)
            fresh = database()
            self.addCleanup(fresh.close)
            apply(fresh, output.read_text())
            self.assertEqual(fresh.execute('SELECT id,groupId FROM identityCatalogue').fetchall(), [('active', None)])
            self.assertEqual(fresh.execute('SELECT * FROM identityCatalogueSource').fetchall(), [('brand:wikidata', 'Q123', 'active')])


if __name__ == '__main__':
    unittest.main()
