"""Verify retained SQL guards and statement boundaries without any remote state."""
import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('prepare_schema',Path(__file__).with_name('prepare-schema.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class SchemaRecordingTests(unittest.TestCase):
    def test_preserves_guards_cte_writes_and_trigger_bodies(self):
        db=module.sqlite3.connect(':memory:',factory=module.RecordingConnection)
        db.recorded=[]
        db.executescript("""CREATE TABLE sample(value TEXT);
        SELECT CASE WHEN 1 THEN 1 ELSE json('bad') END;
        WITH seed(value) AS (SELECT 'a;b') INSERT INTO sample SELECT value FROM seed;
        CREATE TRIGGER blocked BEFORE DELETE ON sample BEGIN SELECT RAISE(ABORT,'keep; history'); END;""")
        self.assertEqual(len(db.recorded),4)
        self.assertEqual(db.execute('SELECT value FROM sample').fetchone()[0],'a;b')
        self.assertEqual(len(db.recorded),4)
        with self.assertRaises(module.sqlite3.IntegrityError):db.execute('DELETE FROM sample')
        db.close()

    def test_records_only_fences_lost_during_rebuild(self):
        db=module.sqlite3.connect(':memory:',factory=module.RecordingConnection)
        db.execute('CREATE TABLE retained(id INTEGER)')
        db.execute('CREATE TABLE rebuilt(id INTEGER)')
        self.assertEqual(module.placeholder_fences(db), ['rebuilt', 'retained'])
        db.execute('DROP TABLE rebuilt')
        db.execute('CREATE TABLE rebuilt(id INTEGER, label TEXT)')
        self.assertEqual(module.placeholder_fences(db), ['rebuilt'])
        self.assertEqual(module.placeholder_fences(db), [])
        db.close()

if __name__=='__main__':unittest.main()
