"""Exercise populated historical schema conversion and retained invariants. Refs #194."""
import importlib.util
import pathlib
import sqlite3
import unittest

spec = importlib.util.spec_from_file_location('simplification', pathlib.Path(__file__).with_name('rehearse-simplification.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SimplificationTest(unittest.TestCase):
    def test_populated_conversion_and_immutable_decisions(self):
        before = sqlite3.connect(':memory:')
        self.addCleanup(before.close)
        before.executescript('''PRAGMA foreign_keys=ON;
          CREATE TABLE organisation(id TEXT PRIMARY KEY);
          INSERT INTO organisation VALUES('org');
          CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT); 
          CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,isDraft INTEGER DEFAULT 0,modifiedAt TEXT);
          INSERT INTO project VALUES('p','org');
          INSERT INTO feature VALUES('f','p',0,'before'),('empty','p',0,'before'),('brands','p',0,'before');''')
        for prefix in ['0102', '0110', '0112', '0113', '0114', '0115', '0116', '0117', '0118', '0119', '0120', '0121']:
            before.executescript((pathlib.Path('migrations/0102_place_inheritance_foundation.sql') if prefix == '0102' else next(pathlib.Path('migrations').glob(prefix + '_*.sql'))).read_text())
        before.executescript('''
          INSERT INTO place(id,state,ownerProjectId) VALUES('target','unresolved','p');
          INSERT INTO place(id,state,ssId) VALUES('source','linked','ss-source');
          INSERT INTO placeRevision(id,placeId,sequence,origin,contentHash,payload,facts) VALUES
            ('t1','target',1,'local','hash','{}','{}'),('s1','source',1,'local','hash','{}','{}');
          INSERT INTO featurePlace(featureId,placeId,factsRevisionId,locationRevisionId,revision,actorId)
            VALUES('f','target','t1','t1','association','actor');
          INSERT INTO featurePlaceDetached VALUES('empty','empty-rev','previous','actor','[]'),
            ('brands','brand-rev','previous','actor','[{"names":{"en":"Brand"}}]');
          INSERT INTO projectPlacePolicy VALUES('p','{"distance":20}',7);
          INSERT INTO placeAdoptionProposal(id,featureId,projectId,placeId,candidateRevisionId,associationRevision,featureModifiedAt,policyRevision,evidence)
            VALUES('a','f','p','target','t1','association','before',7,'{"retained":true}'),
            ('b','f','p','target','t1','association','before',8,'{"retained":true}');
          INSERT INTO placeAdoptionDecision(id,proposalId,fieldGroup,action,actorId,reason,associationRevision)
            VALUES('facts','a','facts','applied','actor','accepted','new-association'),
            ('location','a','location','rejected','actor','wrong premises','new-association');
          INSERT INTO placeIdentityReview(id,placeId,ownerProjectId,baseline,projection,actorId) VALUES
            ('accepted','target','p','{}','{"ssId":"ss-source"}','actor'),
            ('rejected','target','p','{}','{"ssId":"ss-other"}','actor'),
            ('pending','target','p','{}','{"ssId":"ss-pending"}','actor');
          INSERT INTO placeIdentityRejection(reviewId,placeId,ssId,actorId,reason)
            VALUES('rejected','target','ss-other','actor','different shop');
          INSERT INTO placeMergeReview(id,identityReviewId,targetPlaceId,sourcePlaceId,targetBaseline,sourceBaseline,sourceFeatureToken,sourceFeatureCount,sourceRevisionId,actorId)
            VALUES('m1','accepted','target','source','{}','{}','[]',0,'s1','actor'),
            ('m2','accepted','target','source','{}','{}','[]',0,'s1','actor');
          INSERT INTO placeRedirect(sourcePlaceId,targetPlaceId,id,sourceSsId,reviewId,actorId,reason)
            VALUES('source','target','redirect','ss-source','m2','actor','same establishment');
          UPDATE place SET state='redirect',ssId=NULL WHERE id='source';
          UPDATE place SET state='linked',ssId='ss-source' WHERE id='target';
          INSERT INTO placeIdentityHistory(id,placeId,previousState,ssId,sourceRevisionId,actorId,reason,reviewId)
            VALUES('h','target','unresolved','ss-source','t1','actor','accepted merge','accepted');
          UPDATE placeRefresh SET phase='ready',runId='run',lease='lease',leaseUntil=123456;
          INSERT INTO placeRefreshItem(runId,placeId,ssId,status,featureCursor) VALUES('run','target','ss-source','pending','f');
          INSERT INTO placeRefreshFeature VALUES('run','target','f','p','a',NULL,'processed',1),
            ('run','target','gone','p',NULL,'removed','unlinked',0);
        ''')
        after = sqlite3.connect(':memory:')
        self.addCleanup(after.close)
        before.backup(after)
        after.execute('PRAGMA foreign_keys=ON')
        after.executescript('BEGIN;\n' + '\n'.join((pathlib.Path('migrations') / name).read_text() for name in module.MIGRATIONS) + '\nCOMMIT;')
        receipt = module.verify(before, after)
        self.assertEqual(len(receipt['tables']), 9)
        # Rehearse the next ownership migration with pending, rejected and merged historical evidence.
        org_spec = importlib.util.spec_from_file_location('organisation_ownership', pathlib.Path(__file__).with_name('rehearse-organisation-ownership.py'))
        org_module = importlib.util.module_from_spec(org_spec)
        org_spec.loader.exec_module(org_module)
        owned = sqlite3.connect(':memory:')
        self.addCleanup(owned.close)
        after.backup(owned)
        owned.execute('PRAGMA foreign_keys=ON')
        owned.executescript('BEGIN;\n' + (pathlib.Path('migrations') / org_module.MIGRATION).read_text() + '\nCOMMIT;')
        self.assertEqual(org_module.verify(after, owned)['privatePlaces'], 1)
        self.assertEqual(owned.execute("SELECT ownerOrganisationId FROM place WHERE id='target'").fetchone()[0], 'org')
        self.assertEqual(receipt['convertedRecords']['placeAdoptionDecision'], 2)
        for query in [
            "UPDATE placeAdoptionProposal SET factsDecision=NULL WHERE id='a'",
            "UPDATE placeAdoptionProposal SET evidence='{}' WHERE id='a'",
            "UPDATE placeIdentityReview SET rejection=NULL WHERE id='rejected'",
            "UPDATE placeIdentityReview SET mergeReviews='[]' WHERE id='accepted'",
            "UPDATE place SET redirect=NULL WHERE id='source'",
            "DELETE FROM place WHERE id='source'",
            "DELETE FROM placeIdentityReview WHERE id='accepted'",
        ]:
            with self.assertRaises(sqlite3.IntegrityError, msg=query):
                after.execute(query)
        self.assertIsNone(after.execute("SELECT rejection FROM placeIdentityReview WHERE id='pending'").fetchone()[0])
        self.assertIsNone(after.execute("SELECT factsDecision FROM placeAdoptionProposal WHERE id='b'").fetchone()[0])


if __name__ == '__main__':
    unittest.main()
