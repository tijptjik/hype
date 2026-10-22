"""Refs #194: exercise real SQLite routing/retention constraints before local application."""
import sqlite3
import unittest
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[2] / 'migrations/0147_historical_layers.sql'

class HistoricalLayersTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
        PRAGMA foreign_keys=ON;
        PRAGMA recursive_triggers=ON;
        CREATE TABLE project(id TEXT PRIMARY KEY,flags TEXT);
        CREATE TABLE layer(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,
          metadata TEXT,rank INTEGER DEFAULT 0,isDefaultVisible INTEGER DEFAULT 0,
          isPublished INTEGER DEFAULT 0,isArchived INTEGER DEFAULT 0);
        CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT,nameShort TEXT,nameGen INTEGER,nameShortGen INTEGER,PRIMARY KEY(layerId,locale));
        CREATE TABLE layerProperty(layerId TEXT,propertyId TEXT,isVisible INTEGER,isUserContributable INTEGER,UNIQUE(layerId,propertyId));
        CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,layerId TEXT REFERENCES layer(id),isIntangible INTEGER,isVisitable INTEGER,modifiedAt TEXT,isPublished INTEGER DEFAULT 1);
        INSERT INTO project VALUES('p','{}');
        INSERT INTO layer(id,organisationId,projectId,isPublished) VALUES('main','org','p',1);
        INSERT INTO layerI18n VALUES('main','en','Current','Current',0,0);
        INSERT INTO layerProperty VALUES('main','condition',1,1);
        INSERT INTO feature(id,projectId,layerId,isIntangible,isVisitable,modifiedAt,isPublished) VALUES('old','p','main',1,0,'before',1);
        INSERT INTO feature(id,projectId,layerId,isIntangible,isVisitable,modifiedAt,isPublished) VALUES('live','p','main',0,1,'before',0);
        ''')
        self.db.execute('ALTER TABLE feature ADD COLUMN geometry TEXT')
        self.db.executescript((MIGRATION.parent/'0078_feature_spatial_index.sql').read_text())
        self.db.executescript(MIGRATION.read_text())

    def toggle(self, enabled):
        self.db.execute('UPDATE project SET flags=? WHERE id=?', ('{"showHistoricalLayers":'+str(enabled).lower()+'}', 'p'))

    def placement(self, id):
        return self.db.execute('SELECT layerId FROM feature WHERE id=?',(id,)).fetchone()[0]

    def test_disabled_project_never_provisions_historical_layers(self):
        for flags in ('{}', '{"showHistoricalLayers":false}'):
            self.db.execute("UPDATE project SET flags=? WHERE id='p'", (flags,))
            self.db.execute("UPDATE feature SET isIntangible=1 WHERE id='live'")
            self.db.execute("INSERT INTO layer(id,organisationId,projectId) VALUES(?,'org','p')", ('source'+flags,))
            self.assertEqual(self.db.execute("SELECT count(*) FROM layer WHERE historicalSourceLayerId IS NOT NULL").fetchone()[0], 0)
            self.assertEqual(self.placement('old'), 'main')
            self.assertEqual(self.placement('live'), 'main')

    def test_insert_spatial_cells_follow_actual_historical_layer(self):
        self.toggle(True)
        for intangible, expected in [(0, 'main'), (1, 'history:main')]:
            self.db.execute("""INSERT INTO feature(id,projectId,layerId,isIntangible,geometry,spatialIndex)
              VALUES(?,'p','main',?,'{"type":"Point","coordinates":[114,22]}',
              '{"geometry":{"type":"Point","coordinates":[114,22]},"longitude":114,"latitude":22,"cells":{"8":"cell8","9":"cell9"}}')""", ('spatial'+str(intangible),intangible))
            self.assertEqual(self.db.execute('SELECT layerId FROM featureSpatial WHERE featureId=? ORDER BY resolution',('spatial'+str(intangible),)).fetchall(), [(expected,),(expected,)])

    def test_toggle_retains_configuration_and_publication(self):
        self.toggle(True)
        self.assertEqual(self.placement('old'), 'history:main')
        self.assertEqual(self.placement('live'), 'main')
        self.db.execute("UPDATE layer SET metadata='custom' WHERE id='history:main'")
        self.db.execute("DELETE FROM layerProperty WHERE layerId='history:main'")
        self.toggle(False)
        self.assertEqual(self.placement('old'),'main')
        self.toggle(True)
        self.assertEqual(self.placement('old'),'history:main')
        self.assertEqual(self.db.execute("SELECT metadata FROM layer WHERE id='history:main'").fetchone()[0],'custom')
        self.assertEqual(self.db.execute("SELECT count(*) FROM layerProperty WHERE layerId='history:main'").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT isPublished FROM feature WHERE id='live'").fetchone()[0],0)

    def test_save_reopen_and_new_source(self):
        self.toggle(True)
        self.db.execute("UPDATE feature SET isIntangible=1 WHERE id='live'")
        self.assertEqual(self.placement('live'),'history:main')
        self.db.execute("UPDATE feature SET isIntangible=0 WHERE id='old'")
        self.assertEqual(self.placement('old'),'main')
        self.db.execute("INSERT INTO layer(id,organisationId,projectId) VALUES('next','org','p')")
        self.db.execute("INSERT INTO feature(id,projectId,layerId,isIntangible,isVisitable,modifiedAt,isPublished) VALUES('new','p','next',1,0,'now',1)")
        self.assertEqual(self.placement('new'),'history:next')

    def test_restoring_an_archived_source_provisions_its_child(self):
        self.db.execute("UPDATE layer SET isArchived=1 WHERE id='main'")
        self.toggle(True)
        self.assertEqual(self.db.execute("SELECT count(*) FROM layer WHERE historicalSourceLayerId='main'").fetchone()[0],0)
        self.db.execute("UPDATE layer SET isArchived=0 WHERE id='main'")
        self.assertEqual(self.placement('old'),'history:main')

    def test_managed_parent_and_delete(self):
        self.toggle(True)
        for statement in ["DELETE FROM layer WHERE id='history:main'", "UPDATE layer SET projectId='other' WHERE id='history:main'", "UPDATE layer SET historicalSourceLayerId=NULL WHERE id='history:main'", "UPDATE layer SET projectId='other' WHERE id='main'"]:
            with self.assertRaises(sqlite3.IntegrityError): self.db.execute(statement)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO layer(id,organisationId,projectId,historicalSourceLayerId) VALUES('bad','other','p','main')")

if __name__ == '__main__': unittest.main()
