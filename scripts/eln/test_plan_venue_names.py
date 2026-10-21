"""Refs #194: verify research proposals preserve editorial and entity boundaries."""

import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

SPEC = importlib.util.spec_from_file_location("venue_plan", Path(__file__).with_name("plan-venue-names.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class VenueNamePlanTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript("""
          CREATE TABLE organisation(id TEXT, code TEXT);
          CREATE TABLE project(id TEXT, organisationId TEXT, code TEXT);
          CREATE TABLE feature(id TEXT, projectId TEXT, layerId TEXT, organisationId TEXT);
          CREATE TABLE featureI18n(featureId TEXT, locale TEXT, title TEXT, displayAddress TEXT);
          CREATE TABLE featureLocation(featureId TEXT, locationId TEXT);
          CREATE TABLE location(id TEXT, state TEXT, kind TEXT, ownerOrganisationId TEXT);
          CREATE TABLE locationRevision(id TEXT,locationId TEXT,sequence INTEGER,origin TEXT,facts TEXT);
          CREATE TABLE organisationLocation(organisationId TEXT,locationId TEXT,revision TEXT,overrides TEXT);
          INSERT INTO organisation VALUES('org','eunic');
          INSERT INTO project VALUES('project','org','eln');
          INSERT INTO feature VALUES('book','project','2026','org');
          INSERT INTO featureI18n VALUES('book','en','The novel','Venue, 1 Main Street');
          INSERT INTO featureLocation VALUES('book','venue');
          INSERT INTO location VALUES('venue','unresolved','establishment','org');
        """)
        self.set_names({"en": "The novel", "de": "Unverändert"})
        self.research = {"projectId": "project", "projectCode": "eln", "organisationCode": "eunic", "venues": [{
            "key": "venue", "names": {"en": "Venue", "zh-hant": "場地"}, "featureIds": ["book"],
            "evidence": [{"url": "https://venue.example", "quotedText": "場地"}],
            "notes": "", "traditionalChineseDecision": "supported",
        }]}

    def set_names(self, names):
        self.db.execute("DELETE FROM locationRevision")
        self.db.execute("INSERT INTO locationRevision VALUES('revision','venue',1,'local',?)", (json.dumps({"names": names}),))

    def test_name_fix_preserves_book_title_other_locales_and_database(self):
        before = list(self.db.iterdump())
        proposals, summary = MODULE.plan(self.db, self.research)
        self.assertEqual(proposals[0]["proposedAfter"], {"en": "Venue", "zh-hant": "場地", "de": "Unverändert"})
        self.assertEqual(proposals[0]["featureTitle"], "The novel")
        self.assertEqual(proposals[0]["expectedRevisionId"], "revision")
        self.assertEqual(summary["byDecision"], {"supported": 1})
        self.assertEqual(before, list(self.db.iterdump()))

    def test_replay_becomes_no_change(self):
        self.set_names({"en": "Venue", "zh-hant": "場地"})
        proposals, _ = MODULE.plan(self.db, self.research)
        self.assertEqual(proposals[0]["decision"], "no-change")

    def test_edited_chinese_name_conflicts_instead_of_overwriting(self):
        self.set_names({"en": "The novel", "zh-hant": "人手編輯"})
        proposals, _ = MODULE.plan(self.db, self.research)
        self.assertEqual(proposals[0]["decision"], "conflict")
        self.assertEqual(proposals[0]["expectedBefore"]["zh-hant"], "人手編輯")

    def test_source_linked_organisation_name_is_fenced(self):
        self.db.execute("UPDATE location SET state='linked',ownerOrganisationId=NULL")
        self.db.execute("UPDATE locationRevision SET origin='saanseoi'")
        self.db.execute("INSERT INTO organisationLocation VALUES('org','venue','correction',?)", (json.dumps({"names": {"en": {"mode": "override", "value": "Editorial venue"}}}),))
        proposals, _ = MODULE.plan(self.db, self.research)
        self.assertEqual(proposals[0]["expectedOrganisationRevision"], "correction")
        self.assertEqual(proposals[0]["decision"], "conflict")

    def test_new_listing_retained_as_unresolved(self):
        self.db.execute("INSERT INTO feature VALUES('new-book','project','2027','org')")
        proposals, summary = MODULE.plan(self.db, self.research)
        self.assertEqual(summary["features"], 2)
        self.assertEqual(next(row for row in proposals if row["featureId"] == "new-book")["decision"], "unresolved")

    def test_changed_venue_address_requires_review(self):
        self.research["venues"][0]["expectedRecords"] = {"book": {"locationId": "venue", "displayAddress": "Venue, 1 Main Street"}}
        self.db.execute("UPDATE featureI18n SET displayAddress='Successor shop, 2 Main Street'")
        proposals, _ = MODULE.plan(self.db, self.research)
        self.assertEqual(proposals[0]["decision"], "conflict")

    def test_wrong_project_scope_rejected(self):
        self.db.execute("UPDATE project SET code='another-project'")
        with self.assertRaisesRegex(ValueError, "identity differs"):
            MODULE.plan(self.db, self.research)

    def test_locale_clear_is_not_inherited(self):
        self.assertEqual(MODULE.effective_names({"names": {"en": "Source", "zh-hant": "來源"}}, {"names": {"zh-hant": {"mode": "clear"}, "de": {"mode": "override", "value": "Deutsch"}}}), {"en": "Source", "de": "Deutsch"})

    def test_ambiguous_shared_location_rejected(self):
        self.db.execute("INSERT INTO feature VALUES('other-book','project','2027','org')")
        self.db.execute("INSERT INTO featureI18n VALUES('other-book','en','Other novel','Other venue')")
        self.db.execute("INSERT INTO featureLocation VALUES('other-book','venue')")
        self.research["venues"].append({"key": "other", "names": {"en": "Other venue"}, "featureIds": ["other-book"], "evidence": [], "notes": "", "traditionalChineseDecision": "unresolved"})
        proposals, _ = MODULE.plan(self.db, self.research)
        self.assertEqual([row["decision"] for row in proposals], ["conflict", "conflict"])


if __name__ == "__main__":
    unittest.main()
