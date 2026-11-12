"""Local integration regressions; use HYPE_DONOR_TEST_DB with a rebuilt database."""
from contextlib import closing
import importlib.util
import json
import os
import sqlite3
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('curation', Path(__file__).with_name('curate-donor-identities.py'))
curation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(curation)


@unittest.skipUnless(os.environ.get('HYPE_DONOR_TEST_DB'), 'Requires an explicit rebuilt local fixture')
class DonorCurationTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        path = Path(os.environ['HYPE_DONOR_TEST_DB']).resolve(strict=True)
        with closing(sqlite3.connect(f'{path.as_uri()}?mode=ro', uri=True)) as source:
            source.backup(self.db)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.location = self.db.execute("SELECT locationId FROM locationSharedHead WHERE json_extract(corrections,'$.brandId.choice.value')='bl-brand-f92a296e7ea8ebb1653c2f7e' LIMIT 1").fetchone()[0]

    def tearDown(self):
        self.db.close()

    def edit_format(self, name):
        self.db.execute("""INSERT INTO locationSharedRevision(id,locationId,previousRevisionId,sourceRevisionId,corrections,actorId,provenance)
          SELECT 'test-editor-format',locationId,id,sourceRevisionId,
          json_set(corrections,'$.format',json_object('original',json_object('present',json('false')),'choice',json_object('mode','override','value',json_object('i18n',json_object('en',json_object('value',?)))),'actorId','editor')),
          'editor','{}' FROM locationSharedHead WHERE locationId=?""", (name, self.location))
        self.db.commit()

    def test_catalogue_only_is_repeatable_without_touching_donors(self):
        before = self.db.execute('SELECT * FROM locationSharedRevision ORDER BY id').fetchall()
        curation.apply(self.db, catalogue_only=True)
        first = curation.report(self.db)
        curation.apply(self.db, catalogue_only=True)
        self.assertEqual(first, curation.report(self.db))
        self.assertEqual(before, [tuple(row) for row in self.db.execute('SELECT * FROM locationSharedRevision ORDER BY id')])
        link = self.db.execute("SELECT json_extract(r.content,'$.groupId') FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.id='bl-brand-979304c697eaae04756dd221'").fetchone()[0]
        self.assertEqual(link, 'bl-group-maxims-group')

    def test_idempotent_and_source_preserved(self):
        before = self.db.execute('SELECT id,facts,rawSource FROM locationRevision ORDER BY id').fetchall()
        curation.apply(self.db)
        first = curation.report(self.db)
        curation.apply(self.db)
        self.assertEqual(first, curation.report(self.db))
        self.assertEqual(first['legacyBrandProperty'], 0)
        self.assertGreater(first['withGroup'], 0)
        self.assertGreater(first['withFormat'], 0)
        self.db.row_factory = None
        self.assertEqual(before, self.db.execute('SELECT id,facts,rawSource FROM locationRevision ORDER BY id').fetchall())
        for kind in ('layer', 'project', 'organisation'):
            revisions = self.db.execute(f"SELECT content FROM {kind}Revision WHERE id LIKE 'donor-brand-retirement:v1:%'").fetchall()
            self.assertTrue(revisions)
            for (content,) in revisions:
                self.assertNotIn('WhWlW8KcN2wq', json.loads(content)['properties'])
        self.assertIsNone(self.db.execute('PRAGMA foreign_key_check').fetchone())

    def test_locked_fields_are_not_written(self):
        self.db.execute("INSERT INTO locationCurationLockRevision VALUES ('test-lock',?,NULL,'{\"groupId\":false,\"format\":false}','admin','now')", (self.location,))
        self.db.commit()
        curation.apply(self.db)
        row = self.db.execute("SELECT json_extract(corrections,'$.groupId'),json_extract(corrections,'$.format') FROM locationSharedHead WHERE locationId=?", (self.location,)).fetchone()
        self.assertEqual(row, (None, None))

    def test_existing_editor_format_is_preserved(self):
        self.edit_format('Reviewed storefront')
        curation.apply(self.db)
        self.assertEqual(self.db.execute("SELECT json_extract(corrections,'$.format.choice.value.i18n.en.value') FROM locationSharedHead WHERE locationId=?", (self.location,)).fetchone()[0], 'Reviewed storefront')

    def test_replay_does_not_reassert_over_later_editor(self):
        curation.apply(self.db)
        self.edit_format('Later storefront')
        curation.apply(self.db)
        self.assertEqual(self.db.execute("SELECT json_extract(corrections,'$.format.choice.value.i18n.en.value') FROM locationSharedHead WHERE locationId=?", (self.location,)).fetchone()[0], 'Later storefront')

    def test_legacy_value_blocks_retirement_and_rolls_back(self):
        # The existing definition is valid; an actual assignment must stop removal.
        feature = self.db.execute("SELECT id FROM feature WHERE layerId='1msQMcuqfHrP' LIMIT 1").fetchone()[0]
        self.db.execute("INSERT INTO featureRevisionWriteScope(featureId,token) VALUES (?,'test')", (feature,))
        self.db.execute("INSERT INTO featureProperty(featureId,propertyId,propertyValueId) SELECT ?,'WhWlW8KcN2wq',id FROM propertyValue WHERE propertyId='WhWlW8KcN2wq' LIMIT 1", (feature,))
        self.db.commit()
        before = self.db.execute('SELECT count(*) FROM locationSharedRevision').fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            curation.apply(self.db)
        self.assertEqual(before, self.db.execute('SELECT count(*) FROM locationSharedRevision').fetchone()[0])
        self.assertEqual(1, self.db.execute("SELECT count(*) FROM property WHERE id='WhWlW8KcN2wq'").fetchone()[0])


if __name__ == '__main__':
    unittest.main()
