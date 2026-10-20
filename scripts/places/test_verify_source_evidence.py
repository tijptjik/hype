import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('verifier', Path(__file__).with_name('verify-source-evidence.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class EvidenceVerificationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'evidence.sqlite'
        self.db = sqlite3.connect(self.path)
        self.addCleanup(self.db.close)
        self.db.executescript('CREATE TABLE placeRefresh(runId TEXT,accepted TEXT,target TEXT,phase TEXT);')
        self.db.executescript(Path('migrations/0119_place_source_changes.sql').read_text())

    def complete(self):
        pin = dict(datasetCode='dataset', resourceType='place', fromRelease='old', toRelease='new')
        page = dict(pin=pin, nextCursor=None, records=[dict(sourceRecordId='record', type='removed')])
        self.db.execute("INSERT INTO placeSourceTransition(id,toPublication,phase,plan) VALUES('run','{}','complete',?)", (json.dumps(dict(reviewRequired=False, comparisons=[{}])),))
        self.db.execute("INSERT INTO placeSourceComparison(id,transitionId,datasetCode,resourceType,sourceVariant,fromRelease,toRelease,pin,pageNumber,complete,removed) VALUES('comparison','run','dataset','place','default','old','new',?,1,1,1)", (json.dumps(pin),))
        self.db.execute("INSERT INTO placeSourcePage VALUES('comparison',0,'',NULL,?)", (json.dumps(page),))
        self.db.execute("INSERT INTO placeSourceEvidenceId VALUES('comparison','record',0)")
        self.db.commit()

    def test_empty_database_does_not_prove_completion(self):
        with self.assertRaisesRegex(ValueError, 'No publisher transitions'):
            verifier.verify(self.path, True)

    def test_complete_evidence_verifies_without_writing(self):
        self.complete()
        before = self.path.read_bytes()
        result = verifier.verify(self.path, True)
        self.assertTrue(result['comparisons'][0]['complete'])
        self.assertEqual(result['comparisons'][0]['counts']['removed'], 1)
        self.assertEqual(before, self.path.read_bytes())

    def test_checkpoint_counter_mismatch_fails(self):
        self.complete()
        self.db.execute('UPDATE placeSourceComparison SET removed=2')
        self.db.commit()
        with self.assertRaisesRegex(ValueError, 'counts differ'):
            verifier.verify(self.path, True)

    def test_false_completion_fails(self):
        self.complete()
        self.db.execute('UPDATE placeSourceComparison SET complete=0')
        self.db.commit()
        with self.assertRaisesRegex(ValueError, 'completion differs'):
            verifier.verify(self.path, True)

    def test_missing_identity_index_fails(self):
        self.complete()
        self.db.executescript('DROP TRIGGER place_source_id_immutable_delete; DELETE FROM placeSourceEvidenceId;')
        with self.assertRaisesRegex(ValueError, 'Identity index differs'):
            verifier.verify(self.path, True)

    def test_independent_summary_requires_exact_pin_and_counts(self):
        self.complete()
        path = Path(self.directory.name) / 'summary.json'
        summary = dict(pin=dict(datasetCode='dataset', resourceType='place', fromRelease='old', toRelease='new'), summary=dict(added_count=0, changed_count=0, removed_count=1))
        path.write_text(json.dumps(summary))
        verifier.verify(self.path, True, path)
        summary['summary']['removed_count'] = 2
        path.write_text(json.dumps(summary))
        with self.assertRaisesRegex(ValueError, 'complete API summary'):
            verifier.verify(self.path, True, path)
        summary['pin']['toRelease'] = 'wrong'
        path.write_text(json.dumps(summary))
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            verifier.verify(self.path, True, path)


if __name__ == '__main__':
    unittest.main()
