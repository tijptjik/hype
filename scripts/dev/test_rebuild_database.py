"""Refs #194. Local rebuild must roll back failed imports and reject other destinations."""
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('rebuild-database.py')


class RebuildDatabaseTest(unittest.TestCase):
    def test_failed_import_rolls_back_all_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory)/'input.sqlite'
            plan = Path(directory)/'plan.sql'
            with sqlite3.connect(database) as db:
                db.execute('CREATE TABLE sample(id TEXT PRIMARY KEY)')
            plan.write_text("INSERT INTO sample VALUES ('same'); INSERT INTO sample VALUES ('same');")
            result = subprocess.run(['python3',str(SCRIPT),'sql',str(database),str(plan)], capture_output=True)
            self.assertNotEqual(result.returncode,0)
            with sqlite3.connect(database) as db:
                self.assertEqual(db.execute('SELECT * FROM sample').fetchall(),[])

    def test_install_refuses_non_development_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'source.sqlite'
            target = Path(directory)/'target.sqlite'
            for path in [source,target]:
                with sqlite3.connect(path) as db:
                    db.execute('CREATE TABLE sample(id TEXT PRIMARY KEY)')
            result = subprocess.run(['python3',str(SCRIPT),'install',str(source),str(target),str(Path(directory)/'backup.sqlite')],capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn(b'Not the normal local D1 database',result.stderr)
            self.assertFalse((Path(directory)/'backup.sqlite').exists())

    def test_successful_import_checks_foreign_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory)/'input.sqlite'
            plan = Path(directory)/'plan.sql'
            with sqlite3.connect(database) as db:
                db.executescript('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parentId INTEGER REFERENCES parent(id));')
            plan.write_text('INSERT INTO child VALUES (42);')
            result = subprocess.run(['python3',str(SCRIPT),'sql',str(database),str(plan)],capture_output=True)
            self.assertNotEqual(result.returncode,0)
            with sqlite3.connect(database) as db:
                self.assertEqual(db.execute('SELECT * FROM child').fetchall(),[])


if __name__ == '__main__':
    unittest.main()
