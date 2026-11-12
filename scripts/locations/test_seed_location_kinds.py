"""Refs #194: meaningful stale/identity/replay acceptance for the guarded type seed."""

import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

SPEC = importlib.util.spec_from_file_location(
    "kind_seed", Path(__file__).with_name("seed-location-kinds.py")
)
seed = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed)


def fixture():
    """Populate representative ancestry and immutable baselines with deliberately shared identities."""
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT UNIQUE);
        CREATE TABLE project(id TEXT PRIMARY KEY,code TEXT UNIQUE,organisationId TEXT REFERENCES organisation(id));
        CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT REFERENCES project(id),isArchived INTEGER DEFAULT 0);
        CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT);
        CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT,projectId TEXT,layerId TEXT,
            isArchived INTEGER DEFAULT 0,isPublished INTEGER DEFAULT 0,isDraft INTEGER DEFAULT 0,
            isIntangible INTEGER DEFAULT 0,isVisitable INTEGER DEFAULT 1,modifiedAt TEXT DEFAULT 'original');
        CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT NOT NULL,ssId TEXT,ownerOrganisationId TEXT,
            state TEXT DEFAULT 'unresolved',sourceAvailability TEXT DEFAULT 'current');
        CREATE TABLE locationRevision(id TEXT PRIMARY KEY,locationId TEXT REFERENCES location(id),version INTEGER,
            origin TEXT,ssId TEXT,apiVersion TEXT,releaseId TEXT,snapshotId TEXT,contentHash TEXT,rawSource TEXT,facts TEXT,
            createdAt TEXT,UNIQUE(locationId,version));
        CREATE TABLE featureLocation(featureId TEXT PRIMARY KEY REFERENCES feature(id),locationId TEXT REFERENCES location(id),
            revision TEXT,factsRevisionId TEXT REFERENCES locationRevision(id),locationRevisionId TEXT REFERENCES locationRevision(id));
        CREATE TABLE organisationLocation(organisationId TEXT,locationId TEXT,revision TEXT,overrides TEXT);
        CREATE TABLE locationRefreshItem(runId TEXT,locationId TEXT,revisionId TEXT,status TEXT,origin TEXT,actorId TEXT);
        CREATE TRIGGER location_local_change AFTER INSERT ON locationRevision WHEN NEW.origin='local' AND NEW.version>1
            BEGIN INSERT INTO locationRefreshItem VALUES('local:'||NEW.id,NEW.locationId,NEW.id,'pending','local',json_extract(NEW.rawSource,'$.actorId')); END;
        CREATE TRIGGER immutable_revision_update BEFORE UPDATE ON locationRevision
            BEGIN SELECT RAISE(ABORT,'immutable'); END;
        CREATE TRIGGER immutable_revision_delete BEFORE DELETE ON locationRevision
            BEGIN SELECT RAISE(ABORT,'immutable'); END;
    """)
    for i, (_, org_code, project_code, _, layer_id) in enumerate(seed.SCOPES):
        org, project, layer = f"o{i}", f"p{i}", layer_id or f"l{i}"
        db.execute("INSERT INTO organisation VALUES(?,?)", (org, org_code))
        db.execute("INSERT INTO project VALUES(?,?,?)", (project, project_code, org))
        db.execute("INSERT INTO layer(id,projectId) VALUES(?,?)", (layer, project))
        db.execute("INSERT INTO layerI18n VALUES(?,?,?)", (layer, "en", project_code))
    db.execute("INSERT INTO layer(id,projectId) VALUES('dropoffs','p3')")
    db.execute("INSERT INTO layer(id,projectId,isArchived) VALUES('old-neon','p0',1)")

    def add(fid, scope, loc=None, kind="unknown", source=False, layer=None, archived=0):
        actual_layer = layer or seed.SCOPES[scope][4] or f"l{scope}"
        db.execute(
            "INSERT INTO feature(id,organisationId,projectId,layerId,isArchived) VALUES(?,?,?,?,?)",
            (fid, f"o{scope}", f"p{scope}", actual_layer, archived),
        )
        if loc is None:
            return
        if not db.execute("SELECT 1 FROM location WHERE id=?", (loc,)).fetchone():
            db.execute(
                "INSERT INTO location(id,kind,ssId,ownerOrganisationId,state) VALUES(?,?,?,?,?)",
                (
                    loc,
                    kind,
                    "canonical" if source else None,
                    None if source else f"o{scope}",
                    "linked" if source else "unresolved",
                ),
            )
            db.execute(
                "INSERT INTO locationRevision VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    f"r-{loc}",
                    loc,
                    1,
                    "saanseoi" if source else "local",
                    "canonical" if source else None,
                    "v1" if source else None,
                    "release" if source else None,
                    "snapshot" if source else None,
                    "old-hash",
                    '{"evidence":"original"}',
                    '{"names":{"en":"original"}}',
                    "original-time",
                ),
            )
        db.execute(
            "INSERT INTO featureLocation VALUES(?,?,?,?,?)",
            (fid, loc, f"a-{fid}", f"r-{loc}", f"r-{loc}"),
        )

    add("ghost", 0, "building-to-seed", archived=1)
    add("eln-book", 1, "venue-to-seed")
    add("correct", 2, "correct", kind="establishment")
    add("missing", 0)
    add("conflict-ghost", 0, "mixed")
    add("conflict-shop", 2, "mixed")
    add("linked", 0, "source", kind="establishment", source=True)
    add("linked-unknown", 0, "source-unknown", source=True)
    add("contradictory", 1, "wrong", kind="building")
    add("donor", 3, "donor", kind="establishment")
    add("dropoff", 3, "dropoff", layer="dropoffs")
    add("historic-neon", 0, "neon", layer="old-neon", archived=1)
    add("shared-ghost", 0, "shared")
    add("shared-dropoff", 3, "shared", layer="dropoffs")
    db.execute(
        "INSERT INTO organisationLocation VALUES('o0','building-to-seed','c1','{}')"
    )
    db.commit()
    return db


class KindSeedTest(unittest.TestCase):
    def setUp(self):
        self.db = fixture()
        self.document = seed.plan(self.db, "test:seed-actor")

    def tearDown(self):
        self.db.close()

    def test_taxonomy_columns_and_generated_matching_type_replay(self):
        self.db.executescript("""
            ALTER TABLE location ADD COLUMN class TEXT;
            UPDATE location SET class=kind,kind=CASE kind WHEN 'building' THEN 'built' ELSE 'operational' END
                WHERE kind IN ('building','establishment');
            ALTER TABLE location ADD COLUMN matchingType TEXT GENERATED ALWAYS AS (coalesce(class,kind)) VIRTUAL;
        """)
        document = seed.plan(self.db, "test:taxonomy")
        seed.apply_local(self.db, document)
        seed.apply_local(self.db, document)
        row = self.db.execute("SELECT kind,class,matchingType FROM location WHERE id='building-to-seed'").fetchone()
        self.assertEqual(tuple(row), ('built', 'building', 'building'))
        seed.apply_local(self.db, document, True)
        row = self.db.execute("SELECT kind,class,matchingType FROM location WHERE id='building-to-seed'").fetchone()
        self.assertEqual(tuple(row), ('unknown', None, 'unknown'))

    def test_complete_inventory_and_conflicts(self):
        decisions = {d["locationId"]: d for d in self.document["decisions"]}
        self.assertEqual(self.document["counts"]["totalFeatures"], 11)
        self.assertEqual(self.document["counts"]["unassociatedFeatures"], 1)
        self.assertEqual(self.document["counts"]["supported"], 2)
        self.assertEqual(decisions["mixed"]["reason"], "conflicting-dataset-kinds")
        self.assertEqual(decisions["source"]["reason"], "contradictory-existing-kind")
        self.assertTrue(decisions["source"]["sourceLinked"])
        self.assertEqual(
            decisions["source-unknown"]["reason"], "source-identity-review"
        )
        self.assertEqual(
            decisions["shared"]["reason"], "shared-with-unclassified-dataset"
        )
        self.assertEqual(decisions["wrong"]["reason"], "contradictory-existing-kind")
        self.assertEqual(decisions["correct"]["decision"], "no-change")
        self.assertNotIn("dropoff", decisions)
        self.assertNotIn("neon", decisions)
        self.assertEqual(self.document["counts"]["archivedFeatures"], 1)
        self.assertEqual(len(self.document["scopes"][0]["excludedLayers"]), 1)

    def test_replay_preservation_and_audited_rollback(self):
        preserved = {
            table: seed.rows(self.db, f"SELECT * FROM {table}")
            for table in (
                "feature",
                "featureLocation",
                "organisationLocation",
                "organisation",
                "project",
                "layer",
            )
        }
        old_revisions = seed.rows(self.db, "SELECT * FROM locationRevision ORDER BY id")
        receipt = seed.apply_local(self.db, self.document)
        self.assertEqual(receipt["appendedRevisions"], 2)
        self.assertEqual(
            receipt["after"]["refreshItems"] - receipt["before"]["refreshItems"], 2
        )
        self.assertEqual(
            seed.apply_local(self.db, self.document)["appendedRevisions"], 0
        )
        self.assertEqual(seed.plan(self.db, "test:replan")["counts"]["supported"], 0)
        for table, original in preserved.items():
            self.assertEqual(seed.rows(self.db, f"SELECT * FROM {table}"), original)
        for revision in old_revisions:
            self.assertEqual(
                seed.rows(
                    self.db,
                    "SELECT * FROM locationRevision WHERE id=?",
                    (revision["id"],),
                )[0],
                revision,
            )
        head = seed.rows(
            self.db,
            "SELECT * FROM locationRevision WHERE locationId='building-to-seed' ORDER BY version DESC",
        )[0]
        payload = json.loads(head["rawSource"])
        self.assertEqual(payload["actorId"], "test:seed-actor")
        self.assertEqual(
            payload["typeChange"], {"before": "unknown", "after": "building"}
        )
        self.assertEqual(head["facts"], old_revisions[0]["facts"])
        self.assertEqual(
            seed.apply_local(self.db, self.document, rollback=True)[
                "appendedRevisions"
            ],
            2,
        )
        self.assertEqual(
            seed.apply_local(self.db, self.document, rollback=True)[
                "appendedRevisions"
            ],
            0,
        )
        self.assertEqual(
            self.db.execute(
                "SELECT kind FROM location WHERE id='building-to-seed'"
            ).fetchone()[0],
            "unknown",
        )
        self.assertEqual(
            self.db.execute("SELECT count(*) FROM locationRevision").fetchone()[0],
            len(old_revisions) + 4,
        )
        with self.assertRaises(sqlite3.IntegrityError):
            seed.apply_local(
                self.db, self.document
            )  # Forward plan cannot override a reviewed rollback.

    def assert_stale(self, sql):
        self.db.execute(sql)
        self.db.commit()
        before = list(self.db.iterdump())
        with self.assertRaises(sqlite3.IntegrityError):
            seed.apply_local(self.db, self.document)
        self.assertEqual(list(self.db.iterdump()), before)

    def test_stale_kind_is_atomic(self):
        self.assert_stale("UPDATE location SET kind='natural' WHERE id='venue-to-seed'")

    def test_stale_revision_is_atomic(self):
        revision = seed.rows(
            self.db, "SELECT * FROM locationRevision WHERE locationId='venue-to-seed'"
        )[0]
        revision.update(id="later", version=2)
        self.db.execute(
            f"INSERT INTO locationRevision VALUES({','.join('?' for _ in revision)})",
            tuple(revision.values()),
        )
        self.db.commit()
        self.assert_stale(
            "UPDATE feature SET modifiedAt=modifiedAt WHERE id='eln-book'"
        )

    def test_stale_feature_and_association_rejected(self):
        self.assert_stale(
            "UPDATE featureLocation SET revision='changed' WHERE featureId='ghost'"
        )

    def test_stale_correction_rejected(self):
        self.assert_stale("UPDATE organisationLocation SET revision='c2'")

    def test_new_feature_requires_reinventory(self):
        self.assert_stale(
            "INSERT INTO feature(id,organisationId,projectId,layerId) VALUES('later','o1','p1','l1')"
        )

    def test_schema_change_rejected(self):
        self.assert_stale("CREATE TABLE new_contract(id TEXT)")

    def test_kind_without_this_plans_revision_is_not_replay(self):
        self.assert_stale(
            "UPDATE location SET kind='building' WHERE id='building-to-seed'"
        )

    def test_no_unreviewed_actor_or_plan_tamper(self):
        with self.assertRaises(ValueError):
            seed.plan(self.db, "")
        self.document["actorId"] = "other"
        with self.assertRaises(ValueError):
            seed.apply_local(self.db, self.document)

    def test_sql_artifact_executes_atomically(self):
        self.db.executescript(
            "BEGIN IMMEDIATE;\n"
            + ";\n".join(seed.statements(self.document))
            + ";\nCOMMIT;"
        )
        self.assertEqual(seed.plan(self.db, "test:replan")["counts"]["supported"], 0)
        self.assertFalse(seed.rows(self.db, "PRAGMA foreign_key_check"))


if __name__ == "__main__":
    unittest.main()
